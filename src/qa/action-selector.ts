/**
 * Action Selector Module
 * 
 * Scores and prioritizes actions based on their potential to increase
 * coverage and discover bugs.
 */

import type { AgentBrowser } from "../agentBrowser.js";
import type { CoverageTracker } from "./coverage.js";
import type { StateTracker } from "./state.js";

// ============================================================================
// Types
// ============================================================================

export type ActionType = "click" | "fill" | "hover" | "press" | "select";

export interface ActionCandidate {
  /** CSS selector or identifier for the element */
  selector: string;
  /** Type of action to perform */
  actionType: ActionType;
  /** Overall priority score (0-40) */
  priorityScore: number;
  /** Breakdown of the score by factor */
  scoreBreakdown: {
    /** Potential for discovering new URLs/forms/modals (0-10) */
    novelty: number;
    /** Business criticality - CTA buttons, forms (0-10) */
    businessCriticality: number;
    /** Risk factor - forms > links > toggles (0-10) */
    risk: number;
    /** Expected number of new states (0-10) */
    branchFactor: number;
  };
  /** Element metadata */
  element: {
    tagName: string;
    text: string;
    role?: string;
    href?: string;
    type?: string;
    formId?: string;
  };
  /** Whether this action has been attempted before */
  wasAttempted: boolean;
  /** Decay factor for repeated attempts (1.0 = no decay) */
  decayFactor: number;
}

export interface ActionSelectorConfig {
  /** Weight for novelty score (default: 0.35) */
  noveltyWeight: number;
  /** Weight for business criticality score (default: 0.25) */
  businessCriticalityWeight: number;
  /** Weight for risk score (default: 0.25) */
  riskWeight: number;
  /** Weight for branch factor score (default: 0.15) */
  branchFactorWeight: number;
  /** Decay rate for repeated action types (default: 0.7) */
  decayRate: number;
  /** Maximum number of times to retry the same element (default: 2) */
  maxRetries: number;
}

export interface ScoringContext {
  /** Set of visited URLs */
  visitedUrls: Set<string>;
  /** Set of submitted form IDs */
  submittedForms: Set<string>;
  /** Set of opened dialog IDs */
  openedDialogs: Set<string>;
  /** Set of interacted element selectors */
  interactedElements: Set<string>;
  /** Map of action type to attempt count */
  actionTypeCounts: Map<string, number>;
  /** Current page URL */
  currentUrl: string;
}

export interface ActionSelector {
  /** Score a single action candidate */
  scoreAction(candidate: ActionCandidate, context: ScoringContext): ActionCandidate;
  /** Score and rank multiple candidates */
  rankActions(candidates: ActionCandidate[], context: ScoringContext): ActionCandidate[];
  /** Select the top N actions to try */
  selectTopActions(candidates: ActionCandidate[], context: ScoringContext, n: number): ActionCandidate[];
  /** Record that an action was attempted */
  recordAttempt(selector: string, actionType: ActionType): void;
  /** Get the current scoring config */
  getConfig(): ActionSelectorConfig;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_ACTION_SELECTOR_CONFIG: ActionSelectorConfig = {
  noveltyWeight: 0.35,
  businessCriticalityWeight: 0.25,
  riskWeight: 0.25,
  branchFactorWeight: 0.15,
  decayRate: 0.7,
  maxRetries: 2,
};

// ============================================================================
// Scoring Heuristics
// ============================================================================

/**
 * Keywords that indicate primary CTAs (call-to-action buttons)
 */
const CTA_KEYWORDS = [
  "sign up", "signup", "register", "create account",
  "get started", "try free", "start free",
  "buy now", "purchase", "checkout", "add to cart",
  "subscribe", "upgrade", "pro", "premium",
  "download", "install", "get app",
  "contact", "book", "schedule", "demo",
  "submit", "send", "confirm", "save",
  "next", "continue", "proceed",
];

/**
 * Keywords that indicate navigation elements
 */
const NAV_KEYWORDS = [
  "home", "about", "contact", "pricing", "features",
  "products", "services", "blog", "news",
  "support", "help", "faq", "docs", "documentation",
  "login", "logout", "sign in", "sign out",
  "account", "profile", "settings", "dashboard",
];

/**
 * Keywords that indicate expandable/toggleable elements
 */
const EXPANDABLE_KEYWORDS = [
  "show more", "see more", "read more", "view more",
  "expand", "collapse", "toggle", "details",
  "dropdown", "menu", "accordion",
];

/**
 * Keywords that indicate forms
 */
const FORM_KEYWORDS = [
  "form", "input", "email", "password", "name",
  "search", "filter", "query",
  "comment", "message", "feedback",
];

/**
 * Calculate novelty score based on action potential to discover new states
 */
function calculateNoveltyScore(
  candidate: ActionCandidate,
  context: ScoringContext
): number {
  const { element, selector } = candidate;
  const text = element.text.toLowerCase();
  let score = 0;

  // Check if element leads to a new URL
  if (element.href) {
    try {
      const targetUrl = new URL(element.href, context.currentUrl).href;
      if (!context.visitedUrls.has(targetUrl)) {
        score += 8; // High score for potentially new URL
      } else {
        score += 1; // Low score for visited URL
      }
    } catch {
      score += 3; // Unknown URL potential
    }
  }

  // Check if it's a form submission
  if (element.tagName === "FORM" || element.type === "submit") {
    const formId = element.formId || selector;
    if (!context.submittedForms.has(formId)) {
      score += 7; // High score for unsubmitted form
    }
  }

  // Check for expandable elements
  if (EXPANDABLE_KEYWORDS.some(kw => text.includes(kw))) {
    score += 5; // Medium-high score for expandables
  }

  // Check if element was interacted with before
  if (context.interactedElements.has(selector)) {
    score -= 4; // Penalty for repeated interaction
  }

  return Math.max(0, Math.min(10, score));
}

/**
 * Calculate business criticality score
 */
function calculateBusinessCriticalityScore(candidate: ActionCandidate): number {
  const { element } = candidate;
  const text = element.text.toLowerCase();
  const tagName = element.tagName.toLowerCase();
  let score = 3; // Base score

  // Primary CTAs get highest score
  if (CTA_KEYWORDS.some(kw => text.includes(kw))) {
    score = 10;
  }
  // Forms are business critical
  else if (tagName === "form" || element.type === "submit") {
    score = 8;
  }
  // Buttons in general
  else if (tagName === "button" || element.role === "button") {
    score = 6;
  }
  // Navigation elements
  else if (NAV_KEYWORDS.some(kw => text.includes(kw))) {
    score = 5;
  }
  // Links
  else if (tagName === "a") {
    score = 4;
  }

  return Math.max(0, Math.min(10, score));
}

/**
 * Calculate risk score (higher = more likely to reveal issues)
 */
function calculateRiskScore(candidate: ActionCandidate): number {
  const { element, actionType } = candidate;
  const tagName = element.tagName.toLowerCase();
  let score = 3; // Base score

  // Forms have high risk (validation errors, submit failures)
  if (tagName === "form" || element.type === "submit" || actionType === "fill") {
    score = 8;
  }
  // Buttons can trigger complex actions
  else if (tagName === "button" || element.role === "button") {
    score = 6;
  }
  // Modals/dialogs
  else if (EXPANDABLE_KEYWORDS.some(kw => element.text.toLowerCase().includes(kw))) {
    score = 5;
  }
  // Links
  else if (tagName === "a") {
    score = 4;
  }
  // Input elements
  else if (tagName === "input" || tagName === "select" || tagName === "textarea") {
    score = 5;
  }

  return Math.max(0, Math.min(10, score));
}

/**
 * Calculate expected branch factor (new states from this action)
 */
function calculateBranchFactor(candidate: ActionCandidate): number {
  const { element, actionType } = candidate;
  const tagName = element.tagName.toLowerCase();
  const text = element.text.toLowerCase();
  let score = 2; // Base score

  // Forms can lead to multiple states (success, validation errors, etc.)
  if (tagName === "form" || actionType === "fill") {
    score = 5;
  }
  // Expandables/accordions create new states
  else if (EXPANDABLE_KEYWORDS.some(kw => text.includes(kw))) {
    score = 4;
  }
  // Navigation to new pages
  else if (element.href && !element.href.startsWith("#")) {
    score = 3;
  }
  // Buttons with potential side effects
  else if (tagName === "button" || element.role === "button") {
    score = 3;
  }

  return Math.max(0, Math.min(10, score));
}

// ============================================================================
// Browser Scripts
// ============================================================================

/**
 * Script to extract action candidates from the current page
 */
const EXTRACT_CANDIDATES_SCRIPT = `
(function() {
  const candidates = [];
  
  // Find all interactive elements
  const interactiveSelectors = [
    'a[href]',
    'button',
    'input[type="submit"]',
    'input[type="button"]',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[onclick]',
    'select',
    'input:not([type="hidden"])',
    'textarea',
    '[class*="btn"]',
    '[class*="button"]',
  ];
  
  const elements = document.querySelectorAll(interactiveSelectors.join(', '));
  
  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  
  function getSelector(el) {
    if (el.id) return '#' + el.id;
    if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
    
    // Build a selector path
    const parts = [];
    let current = el;
    for (let i = 0; current && i < 3; i++) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part = '#' + current.id;
        parts.unshift(part);
        break;
      }
      const classes = Array.from(current.classList || [])
        .filter(c => c && !c.includes('active') && !c.includes('hover') && !c.includes('focus'))
        .slice(0, 2);
      if (classes.length) part += '.' + classes.join('.');
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }
  
  function getActionType(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      if (el.type === 'submit' || el.type === 'button') return 'click';
      return 'fill';
    }
    if (tag === 'select') return 'select';
    return 'click';
  }
  
  for (const el of elements) {
    if (!isVisible(el)) continue;
    
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().slice(0, 100);
    const ariaLabel = el.getAttribute('aria-label') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    
    candidates.push({
      selector: getSelector(el),
      actionType: getActionType(el),
      element: {
        tagName: tag,
        text: text || ariaLabel || placeholder,
        role: el.getAttribute('role') || '',
        href: el.href || '',
        type: el.type || '',
        formId: el.form ? (el.form.id || el.form.name || 'form') : '',
      }
    });
  }
  
  // Deduplicate by selector
  const seen = new Set();
  const unique = candidates.filter(c => {
    if (seen.has(c.selector)) return false;
    seen.add(c.selector);
    return true;
  });
  
  return JSON.stringify(unique.slice(0, 100)); // Limit to 100 candidates
})()
`;

// ============================================================================
// Action Selector Implementation
// ============================================================================

/**
 * Create an action selector with the given configuration
 */
export function createActionSelector(
  config: Partial<ActionSelectorConfig> = {}
): ActionSelector {
  const fullConfig: ActionSelectorConfig = {
    ...DEFAULT_ACTION_SELECTOR_CONFIG,
    ...config,
  };

  // Track attempt counts per selector+actionType
  const attemptCounts = new Map<string, number>();

  function getAttemptKey(selector: string, actionType: ActionType): string {
    return `${actionType}:${selector}`;
  }

  return {
    scoreAction(candidate: ActionCandidate, context: ScoringContext): ActionCandidate {
      // Calculate individual scores
      const novelty = calculateNoveltyScore(candidate, context);
      const businessCriticality = calculateBusinessCriticalityScore(candidate);
      const risk = calculateRiskScore(candidate);
      const branchFactor = calculateBranchFactor(candidate);

      // Calculate weighted score
      const baseScore =
        novelty * fullConfig.noveltyWeight +
        businessCriticality * fullConfig.businessCriticalityWeight +
        risk * fullConfig.riskWeight +
        branchFactor * fullConfig.branchFactorWeight;

      // Apply decay for repeated attempts
      const attemptKey = getAttemptKey(candidate.selector, candidate.actionType);
      const attempts = attemptCounts.get(attemptKey) || 0;
      const decayFactor = Math.pow(fullConfig.decayRate, attempts);

      const wasAttempted = attempts > 0;

      // Apply action type decay (if same type used many times)
      const typeCount = context.actionTypeCounts.get(candidate.actionType) || 0;
      const typeDecay = typeCount > 10 ? 0.9 : 1.0;

      const priorityScore = baseScore * decayFactor * typeDecay * 10; // Scale to 0-40

      return {
        ...candidate,
        priorityScore,
        scoreBreakdown: {
          novelty,
          businessCriticality,
          risk,
          branchFactor,
        },
        wasAttempted,
        decayFactor,
      };
    },

    rankActions(candidates: ActionCandidate[], context: ScoringContext): ActionCandidate[] {
      // Score all candidates
      const scored = candidates.map(c => this.scoreAction(c, context));

      // Sort by priority score (descending)
      return scored.sort((a, b) => b.priorityScore - a.priorityScore);
    },

    selectTopActions(
      candidates: ActionCandidate[],
      context: ScoringContext,
      n: number
    ): ActionCandidate[] {
      const ranked = this.rankActions(candidates, context);

      // Filter out actions that have exceeded max retries
      const filtered = ranked.filter(c => {
        const attemptKey = getAttemptKey(c.selector, c.actionType);
        const attempts = attemptCounts.get(attemptKey) || 0;
        return attempts < fullConfig.maxRetries;
      });

      return filtered.slice(0, n);
    },

    recordAttempt(selector: string, actionType: ActionType): void {
      const key = getAttemptKey(selector, actionType);
      const current = attemptCounts.get(key) || 0;
      attemptCounts.set(key, current + 1);
    },

    getConfig(): ActionSelectorConfig {
      return { ...fullConfig };
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract action candidates from the current page
 */
export async function extractActionCandidates(
  browser: AgentBrowser
): Promise<ActionCandidate[]> {
  try {
    const resultJson = await browser.eval(EXTRACT_CANDIDATES_SCRIPT);
    const rawCandidates = JSON.parse(resultJson) as Array<{
      selector: string;
      actionType: ActionType;
      element: ActionCandidate["element"];
    }>;

    // Add default scoring fields
    return rawCandidates.map(c => ({
      ...c,
      priorityScore: 0,
      scoreBreakdown: {
        novelty: 0,
        businessCriticality: 0,
        risk: 0,
        branchFactor: 0,
      },
      wasAttempted: false,
      decayFactor: 1,
    }));
  } catch (error) {
    console.warn("Failed to extract action candidates:", error);
    return [];
  }
}

/**
 * Build scoring context from trackers
 */
export function buildScoringContext(
  coverage: CoverageTracker,
  state: StateTracker,
  currentUrl: string
): ScoringContext {
  const metrics = coverage.getMetrics();

  // Get action type counts from coverage outcomes
  const actionTypeCounts = new Map<string, number>();
  for (const outcome of coverage.getActionOutcomes()) {
    const type = outcome.action.type;
    actionTypeCounts.set(type, (actionTypeCounts.get(type) || 0) + 1);
  }

  return {
    visitedUrls: metrics.uniqueUrls,
    submittedForms: metrics.uniqueForms,
    openedDialogs: metrics.uniqueDialogs,
    interactedElements: metrics.interactedElements,
    actionTypeCounts,
    currentUrl,
  };
}

/**
 * Format a candidate for display
 */
export function formatCandidate(candidate: ActionCandidate): string {
  const { element, actionType, priorityScore, scoreBreakdown } = candidate;
  return [
    `[${actionType}] ${element.tagName} "${element.text.slice(0, 30)}"`,
    `  Score: ${priorityScore.toFixed(1)} (N:${scoreBreakdown.novelty} B:${scoreBreakdown.businessCriticality} R:${scoreBreakdown.risk} F:${scoreBreakdown.branchFactor})`,
    `  Selector: ${candidate.selector}`,
  ].join("\n");
}

