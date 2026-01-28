/**
 * State Fingerprinting Module
 * 
 * Computes DOM fingerprints to identify unique page states,
 * detect revisits, and track state transitions during exploration.
 */

import { createHash } from "node:crypto";
import type { AgentBrowser } from "../agentBrowser.js";

// ============================================================================
// Types
// ============================================================================

export interface StateFingerprint {
  /** Hash of the URL pathname and search params */
  urlHash: string;
  /** Hash of the DOM structure (tag hierarchy, ignoring content) */
  domStructureHash: string;
  /** Hash of visible text content */
  visibleTextHash: string;
  /** Hash of form states (input values, checkbox states) */
  formStateHash: string;
  /** Hash of dialog/modal states */
  dialogStateHash: string;
  /** Optional auth state identifier (e.g., user ID or session marker) */
  authStateId?: string;
  /** Combined hash for quick comparison */
  combinedHash: string;
  /** Timestamp when fingerprint was taken */
  timestamp: number;
}

export interface StateTransition {
  /** Fingerprint before the action */
  fromState: StateFingerprint;
  /** Fingerprint after the action */
  toState: StateFingerprint;
  /** Action that caused the transition */
  action: {
    type: string;
    selector?: string;
    value?: string;
  };
  /** Whether this transition led to a new state */
  isNewState: boolean;
  /** Timestamp of the transition */
  timestamp: number;
}

export interface StateHistory {
  /** All unique states visited */
  states: Map<string, StateFingerprint>;
  /** All transitions recorded */
  transitions: StateTransition[];
  /** Map of state hash to visit count */
  visitCounts: Map<string, number>;
}

export interface StateTracker {
  /** Record a new state fingerprint */
  recordState(fingerprint: StateFingerprint): boolean;
  /** Record a state transition */
  recordTransition(transition: Omit<StateTransition, "isNewState">): StateTransition;
  /** Check if a state has been visited before */
  isVisited(fingerprint: StateFingerprint): boolean;
  /** Get the visit count for a state */
  getVisitCount(fingerprint: StateFingerprint): number;
  /** Get all unique states */
  getUniqueStates(): StateFingerprint[];
  /** Get the state history */
  getHistory(): StateHistory;
  /** Get the number of unique states */
  getUniqueStateCount(): number;
  /** Reset the tracker */
  reset(): void;
}

// ============================================================================
// Transient Element Filters
// ============================================================================

/**
 * CSS selectors for transient elements that should be ignored in fingerprinting
 * These elements change frequently but don't represent meaningful state changes
 */
const TRANSIENT_SELECTORS = [
  // Loading indicators
  "[class*='loading']",
  "[class*='spinner']",
  "[class*='skeleton']",
  "[aria-busy='true']",
  // Toasts and notifications
  "[class*='toast']",
  "[class*='notification']",
  "[class*='snackbar']",
  "[role='alert']",
  // Timestamps and dynamic content
  "[class*='timestamp']",
  "[class*='time-ago']",
  "time",
  // Avatars and profile images
  "[class*='avatar']",
  "[class*='profile-image']",
  // Ads and tracking
  "[class*='ad-']",
  "[id*='google_ads']",
  "iframe[src*='ads']",
  // Animations
  "[class*='animate']",
  "[class*='transition']",
];

// ============================================================================
// Browser Scripts
// ============================================================================

/**
 * Script to extract DOM structure for fingerprinting
 * Returns a simplified representation of the DOM hierarchy
 */
const DOM_STRUCTURE_SCRIPT = `
(function() {
  const transientSelectors = ${JSON.stringify(TRANSIENT_SELECTORS)};
  
  function isTransient(el) {
    try {
      return transientSelectors.some(sel => el.matches && el.matches(sel));
    } catch {
      return false;
    }
  }
  
  function getStructure(el, depth) {
    if (!el || !el.tagName || depth > 15) return '';
    if (isTransient(el)) return '';
    
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || '';
    const type = el.getAttribute('type') || '';
    
    let sig = tag;
    if (role) sig += '[role=' + role + ']';
    if (type && (tag === 'input' || tag === 'button')) sig += '[type=' + type + ']';
    
    const children = Array.from(el.children || [])
      .map(child => getStructure(child, depth + 1))
      .filter(Boolean);
    
    if (children.length > 0) {
      return sig + '{' + children.join(',') + '}';
    }
    return sig;
  }
  
  return getStructure(document.body, 0);
})()
`;

/**
 * Script to extract visible text content for fingerprinting
 */
const VISIBLE_TEXT_SCRIPT = `
(function() {
  const transientSelectors = ${JSON.stringify(TRANSIENT_SELECTORS)};
  
  function isTransient(el) {
    try {
      return transientSelectors.some(sel => el.matches && el.matches(sel));
    } catch {
      return false;
    }
  }
  
  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  
  function getVisibleText(el) {
    if (!el || isTransient(el)) return '';
    
    // Get text from text nodes only (not nested elements)
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    
    // Get text from visible children
    for (const child of el.children || []) {
      if (isVisible(child)) {
        text += getVisibleText(child);
      }
    }
    
    return text;
  }
  
  return getVisibleText(document.body)
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, 10000); // Limit to prevent huge strings
})()
`;

/**
 * Script to extract form state for fingerprinting
 */
const FORM_STATE_SCRIPT = `
(function() {
  const forms = Array.from(document.querySelectorAll('form'));
  const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
  
  const formStates = forms.map(form => {
    const id = form.id || form.name || form.action || 'form';
    return id;
  });
  
  const inputStates = inputs.map(input => {
    const type = input.type || 'text';
    const name = input.name || input.id || '';
    
    // For sensitive fields, just track presence, not value
    if (type === 'password' || name.toLowerCase().includes('password')) {
      return name + ':password:' + (input.value ? 'filled' : 'empty');
    }
    
    if (type === 'checkbox' || type === 'radio') {
      return name + ':' + type + ':' + input.checked;
    }
    
    if (input.tagName === 'SELECT') {
      return name + ':select:' + input.value;
    }
    
    // For text inputs, hash the value presence
    return name + ':' + type + ':' + (input.value ? 'filled' : 'empty');
  });
  
  return JSON.stringify({ forms: formStates, inputs: inputStates });
})()
`;

/**
 * Script to extract dialog/modal state for fingerprinting
 */
const DIALOG_STATE_SCRIPT = `
(function() {
  const dialogs = Array.from(document.querySelectorAll(
    'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], ' +
    '[class*="modal"]:not([style*="display: none"]):not([style*="display:none"]), ' +
    '[class*="popup"]:not([style*="display: none"]):not([style*="display:none"]), ' +
    '[class*="overlay"]:not([style*="display: none"]):not([style*="display:none"])'
  )).filter(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  
  const dialogInfo = dialogs.map(d => {
    const role = d.getAttribute('role') || 'dialog';
    const label = d.getAttribute('aria-label') || d.getAttribute('aria-labelledby') || '';
    const id = d.id || '';
    return role + ':' + (label || id || 'unnamed');
  });
  
  return JSON.stringify(dialogInfo);
})()
`;

/**
 * Script to detect auth state markers
 */
const AUTH_STATE_SCRIPT = `
(function() {
  // Look for common auth indicators
  const indicators = [];
  
  // Check for user menu/profile elements
  const userElements = document.querySelectorAll(
    '[class*="user-menu"], [class*="profile"], [class*="avatar"], ' +
    '[class*="account"], [aria-label*="account"], [aria-label*="profile"]'
  );
  if (userElements.length > 0) {
    indicators.push('user-ui-present');
  }
  
  // Check for login/logout buttons
  const loginBtn = document.querySelector('a[href*="login"], button:has-text("Log in"), button:has-text("Sign in")');
  const logoutBtn = document.querySelector('a[href*="logout"], button:has-text("Log out"), button:has-text("Sign out")');
  
  if (loginBtn) indicators.push('login-btn');
  if (logoutBtn) indicators.push('logout-btn');
  
  // Check cookies for common auth tokens
  const cookies = document.cookie;
  if (cookies.includes('session') || cookies.includes('token') || cookies.includes('auth')) {
    indicators.push('auth-cookie');
  }
  
  return indicators.join(',');
})()
`;

// ============================================================================
// Hashing Utilities
// ============================================================================

/**
 * Create a short hash of a string using MurmurHash3-like algorithm
 * Fast and suitable for fingerprinting (not cryptographic)
 */
function quickHash(str: string): string {
  const hash = createHash("sha256");
  hash.update(str);
  return hash.digest("hex").slice(0, 16);
}

/**
 * Hash a URL for fingerprinting (pathname + search, ignoring origin)
 */
function hashUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return quickHash(parsed.pathname + parsed.search);
  } catch {
    return quickHash(url);
  }
}

// ============================================================================
// State Fingerprinting Functions
// ============================================================================

/**
 * Capture a state fingerprint from the current page
 */
export async function captureStateFingerprint(
  browser: AgentBrowser,
  currentUrl: string
): Promise<StateFingerprint> {
  // Run all extraction scripts in parallel
  const [domStructure, visibleText, formState, dialogState, authState] = await Promise.all([
    browser.eval(DOM_STRUCTURE_SCRIPT).catch(() => ""),
    browser.eval(VISIBLE_TEXT_SCRIPT).catch(() => ""),
    browser.eval(FORM_STATE_SCRIPT).catch(() => "{}"),
    browser.eval(DIALOG_STATE_SCRIPT).catch(() => "[]"),
    browser.eval(AUTH_STATE_SCRIPT).catch(() => ""),
  ]);

  const urlHash = hashUrl(currentUrl);
  const domStructureHash = quickHash(domStructure);
  const visibleTextHash = quickHash(visibleText);
  const formStateHash = quickHash(formState);
  const dialogStateHash = quickHash(dialogState);
  const authStateId = authState || undefined;

  // Create combined hash for quick comparison
  const combinedHash = quickHash(
    [urlHash, domStructureHash, formStateHash, dialogStateHash].join("|")
  );

  return {
    urlHash,
    domStructureHash,
    visibleTextHash,
    formStateHash,
    dialogStateHash,
    authStateId,
    combinedHash,
    timestamp: Date.now(),
  };
}

/**
 * Compare two fingerprints for equality
 * Uses combined hash for quick comparison
 */
export function fingerprintsEqual(a: StateFingerprint, b: StateFingerprint): boolean {
  return a.combinedHash === b.combinedHash;
}

/**
 * Calculate similarity between two fingerprints (0-1)
 * Useful for detecting partial state changes
 */
export function fingerprintSimilarity(a: StateFingerprint, b: StateFingerprint): number {
  let matches = 0;
  const total = 4;

  if (a.urlHash === b.urlHash) matches++;
  if (a.domStructureHash === b.domStructureHash) matches++;
  if (a.formStateHash === b.formStateHash) matches++;
  if (a.dialogStateHash === b.dialogStateHash) matches++;

  return matches / total;
}

// ============================================================================
// State Tracker Implementation
// ============================================================================

/**
 * Create a state tracker to monitor state changes during exploration
 */
export function createStateTracker(): StateTracker {
  const states = new Map<string, StateFingerprint>();
  const transitions: StateTransition[] = [];
  const visitCounts = new Map<string, number>();

  return {
    recordState(fingerprint: StateFingerprint): boolean {
      const isNew = !states.has(fingerprint.combinedHash);
      
      if (isNew) {
        states.set(fingerprint.combinedHash, fingerprint);
        visitCounts.set(fingerprint.combinedHash, 1);
      } else {
        const count = visitCounts.get(fingerprint.combinedHash) || 0;
        visitCounts.set(fingerprint.combinedHash, count + 1);
      }

      return isNew;
    },

    recordTransition(transition: Omit<StateTransition, "isNewState">): StateTransition {
      const isNewState = !states.has(transition.toState.combinedHash);
      
      // Record the new state
      this.recordState(transition.toState);

      const fullTransition: StateTransition = {
        ...transition,
        isNewState,
      };

      transitions.push(fullTransition);
      return fullTransition;
    },

    isVisited(fingerprint: StateFingerprint): boolean {
      return states.has(fingerprint.combinedHash);
    },

    getVisitCount(fingerprint: StateFingerprint): number {
      return visitCounts.get(fingerprint.combinedHash) || 0;
    },

    getUniqueStates(): StateFingerprint[] {
      return Array.from(states.values());
    },

    getHistory(): StateHistory {
      return {
        states: new Map(states),
        transitions: [...transitions],
        visitCounts: new Map(visitCounts),
      };
    },

    getUniqueStateCount(): number {
      return states.size;
    },

    reset(): void {
      states.clear();
      transitions.length = 0;
      visitCounts.clear();
    },
  };
}

// ============================================================================
// Exports
// ============================================================================

export type { StateFingerprint, StateTransition, StateHistory, StateTracker };
