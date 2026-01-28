/**
 * Coverage Tracking Module
 * 
 * Tracks coverage signals during exploration to measure test thoroughness
 * and guide exploration towards uncovered areas.
 */

import type { AgentBrowser } from "../agentBrowser.js";

// ============================================================================
// Types
// ============================================================================

export interface CoverageMetrics {
  /** Unique URLs visited */
  uniqueUrls: Set<string>;
  /** Unique dialogs/modals opened */
  uniqueDialogs: Set<string>;
  /** Unique forms interacted with */
  uniqueForms: Set<string>;
  /** Unique network requests triggered (endpoint + method) */
  uniqueNetworkRequests: Set<string>;
  /** Unique console errors encountered */
  uniqueConsoleErrors: Set<string>;
  /** Unique elements interacted with (by selector fingerprint) */
  interactedElements: Set<string>;
  /** Unique URLs with forms */
  urlsWithForms: Set<string>;
  /** Unique URLs with errors */
  urlsWithErrors: Set<string>;
}

export interface CoverageSnapshot {
  /** Snapshot of metrics at a point in time */
  metrics: CoverageMetrics;
  /** Timestamp of the snapshot */
  timestamp: number;
  /** Step index when snapshot was taken */
  stepIndex: number;
}

export interface CoverageGain {
  /** URLs discovered since last snapshot */
  newUrls: string[];
  /** Dialogs discovered since last snapshot */
  newDialogs: string[];
  /** Forms discovered since last snapshot */
  newForms: string[];
  /** Network requests triggered since last snapshot */
  newNetworkRequests: string[];
  /** Console errors since last snapshot */
  newConsoleErrors: string[];
  /** Elements interacted with since last snapshot */
  newElements: string[];
  /** Total new items discovered */
  totalGain: number;
  /** Whether any coverage was gained */
  hasGain: boolean;
}

export interface ActionOutcome {
  /** The action that was performed */
  action: {
    type: string;
    selector?: string;
    value?: string;
  };
  /** Coverage gain from this action */
  coverageGain: CoverageGain;
  /** Step index */
  stepIndex: number;
  /** Timestamp */
  timestamp: number;
}

export interface CoverageTracker {
  /** Record a URL visit */
  recordUrl(url: string): boolean;
  /** Record a dialog/modal interaction */
  recordDialog(dialogId: string): boolean;
  /** Record a form interaction */
  recordForm(formId: string): boolean;
  /** Record a network request */
  recordNetworkRequest(method: string, url: string): boolean;
  /** Record a console error */
  recordConsoleError(error: string): boolean;
  /** Record an element interaction */
  recordElementInteraction(selector: string): boolean;
  /** Record a URL that contains forms */
  recordUrlWithForm(url: string): boolean;
  /** Record a URL that has errors */
  recordUrlWithError(url: string): boolean;
  /** Take a snapshot of current coverage */
  takeSnapshot(stepIndex: number): CoverageSnapshot;
  /** Calculate coverage gain since a previous snapshot */
  calculateGain(previous: CoverageSnapshot): CoverageGain;
  /** Record an action outcome with its coverage gain */
  recordActionOutcome(outcome: ActionOutcome): void;
  /** Get all action outcomes */
  getActionOutcomes(): ActionOutcome[];
  /** Get the current metrics */
  getMetrics(): CoverageMetrics;
  /** Get coverage statistics */
  getStats(): CoverageStats;
  /** Get the most effective action types */
  getMostEffectiveActionTypes(): Array<{ type: string; avgGain: number; count: number }>;
  /** Reset the tracker */
  reset(): void;
}

export interface CoverageStats {
  totalUrls: number;
  totalDialogs: number;
  totalForms: number;
  totalNetworkRequests: number;
  totalConsoleErrors: number;
  totalInteractions: number;
  urlsWithForms: number;
  urlsWithErrors: number;
  coverageScore: number; // 0-100 normalized score
}

// ============================================================================
// Browser Scripts
// ============================================================================

/**
 * Script to detect dialogs/modals on the current page
 */
const DETECT_DIALOGS_SCRIPT = `
(function() {
  const dialogs = Array.from(document.querySelectorAll(
    'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], ' +
    '[class*="modal"]:not([style*="display: none"]):not([style*="display:none"]), ' +
    '[class*="popup"]:not([style*="display: none"]):not([style*="display:none"])'
  )).filter(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  
  return JSON.stringify(dialogs.map(d => {
    const id = d.id || '';
    const role = d.getAttribute('role') || 'dialog';
    const label = d.getAttribute('aria-label') || d.getAttribute('aria-labelledby') || '';
    const heading = d.querySelector('h1, h2, h3, h4, h5, h6');
    const title = heading ? heading.textContent.trim().slice(0, 50) : '';
    return [role, id, label, title].filter(Boolean).join('-') || 'unnamed-dialog';
  }));
})()
`;

/**
 * Script to detect forms on the current page
 */
const DETECT_FORMS_SCRIPT = `
(function() {
  const forms = Array.from(document.querySelectorAll('form'));
  
  return JSON.stringify(forms.map(f => {
    const id = f.id || '';
    const name = f.name || '';
    const action = f.action || '';
    const method = (f.method || 'get').toUpperCase();
    const inputCount = f.querySelectorAll('input, select, textarea').length;
    
    // Create a form fingerprint
    const actionPath = action ? new URL(action, window.location.href).pathname : '';
    return [method, actionPath, id, name, 'inputs:' + inputCount].filter(Boolean).join('-') || 'unnamed-form';
  }));
})()
`;

/**
 * Script to detect interactive elements on the page
 */
const DETECT_ELEMENTS_SCRIPT = `
(function() {
  const interactive = Array.from(document.querySelectorAll(
    'a[href], button, input, select, textarea, [role="button"], [role="link"], ' +
    '[role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], ' +
    '[onclick], [data-action], [class*="btn"], [class*="button"]'
  )).filter(el => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  
  return JSON.stringify({
    count: interactive.length,
    types: interactive.reduce((acc, el) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || '';
      const type = el.getAttribute('type') || '';
      const key = [tag, role, type].filter(Boolean).join('-');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  });
})()
`;

// ============================================================================
// Coverage Tracker Implementation
// ============================================================================

/**
 * Create a coverage tracker to monitor test coverage
 */
export function createCoverageTracker(): CoverageTracker {
  const metrics: CoverageMetrics = {
    uniqueUrls: new Set(),
    uniqueDialogs: new Set(),
    uniqueForms: new Set(),
    uniqueNetworkRequests: new Set(),
    uniqueConsoleErrors: new Set(),
    interactedElements: new Set(),
    urlsWithForms: new Set(),
    urlsWithErrors: new Set(),
  };

  const actionOutcomes: ActionOutcome[] = [];

  function cloneMetrics(): CoverageMetrics {
    return {
      uniqueUrls: new Set(metrics.uniqueUrls),
      uniqueDialogs: new Set(metrics.uniqueDialogs),
      uniqueForms: new Set(metrics.uniqueForms),
      uniqueNetworkRequests: new Set(metrics.uniqueNetworkRequests),
      uniqueConsoleErrors: new Set(metrics.uniqueConsoleErrors),
      interactedElements: new Set(metrics.interactedElements),
      urlsWithForms: new Set(metrics.urlsWithForms),
      urlsWithErrors: new Set(metrics.urlsWithErrors),
    };
  }

  return {
    recordUrl(url: string): boolean {
      // Normalize URL (remove trailing slash, lowercase)
      const normalized = normalizeUrl(url);
      const isNew = !metrics.uniqueUrls.has(normalized);
      metrics.uniqueUrls.add(normalized);
      return isNew;
    },

    recordDialog(dialogId: string): boolean {
      const isNew = !metrics.uniqueDialogs.has(dialogId);
      metrics.uniqueDialogs.add(dialogId);
      return isNew;
    },

    recordForm(formId: string): boolean {
      const isNew = !metrics.uniqueForms.has(formId);
      metrics.uniqueForms.add(formId);
      return isNew;
    },

    recordNetworkRequest(method: string, url: string): boolean {
      // Normalize to method + path (ignore query params for deduplication)
      const normalized = `${method.toUpperCase()} ${normalizeUrl(url)}`;
      const isNew = !metrics.uniqueNetworkRequests.has(normalized);
      metrics.uniqueNetworkRequests.add(normalized);
      return isNew;
    },

    recordConsoleError(error: string): boolean {
      // Normalize error (first 200 chars, no line numbers)
      const normalized = error.replace(/:\d+:\d+/g, "").slice(0, 200);
      const isNew = !metrics.uniqueConsoleErrors.has(normalized);
      metrics.uniqueConsoleErrors.add(normalized);
      return isNew;
    },

    recordElementInteraction(selector: string): boolean {
      // Normalize selector
      const normalized = selector.toLowerCase().trim();
      const isNew = !metrics.interactedElements.has(normalized);
      metrics.interactedElements.add(normalized);
      return isNew;
    },

    recordUrlWithForm(url: string): boolean {
      const normalized = normalizeUrl(url);
      const isNew = !metrics.urlsWithForms.has(normalized);
      metrics.urlsWithForms.add(normalized);
      return isNew;
    },

    recordUrlWithError(url: string): boolean {
      const normalized = normalizeUrl(url);
      const isNew = !metrics.urlsWithErrors.has(normalized);
      metrics.urlsWithErrors.add(normalized);
      return isNew;
    },

    takeSnapshot(stepIndex: number): CoverageSnapshot {
      return {
        metrics: cloneMetrics(),
        timestamp: Date.now(),
        stepIndex,
      };
    },

    calculateGain(previous: CoverageSnapshot): CoverageGain {
      const newUrls = setDifference(metrics.uniqueUrls, previous.metrics.uniqueUrls);
      const newDialogs = setDifference(metrics.uniqueDialogs, previous.metrics.uniqueDialogs);
      const newForms = setDifference(metrics.uniqueForms, previous.metrics.uniqueForms);
      const newNetworkRequests = setDifference(metrics.uniqueNetworkRequests, previous.metrics.uniqueNetworkRequests);
      const newConsoleErrors = setDifference(metrics.uniqueConsoleErrors, previous.metrics.uniqueConsoleErrors);
      const newElements = setDifference(metrics.interactedElements, previous.metrics.interactedElements);

      const totalGain = newUrls.length + newDialogs.length + newForms.length +
        newNetworkRequests.length + newConsoleErrors.length + newElements.length;

      return {
        newUrls,
        newDialogs,
        newForms,
        newNetworkRequests,
        newConsoleErrors,
        newElements,
        totalGain,
        hasGain: totalGain > 0,
      };
    },

    recordActionOutcome(outcome: ActionOutcome): void {
      actionOutcomes.push(outcome);
    },

    getActionOutcomes(): ActionOutcome[] {
      return [...actionOutcomes];
    },

    getMetrics(): CoverageMetrics {
      return cloneMetrics();
    },

    getStats(): CoverageStats {
      const totalUrls = metrics.uniqueUrls.size;
      const totalDialogs = metrics.uniqueDialogs.size;
      const totalForms = metrics.uniqueForms.size;
      const totalNetworkRequests = metrics.uniqueNetworkRequests.size;
      const totalConsoleErrors = metrics.uniqueConsoleErrors.size;
      const totalInteractions = metrics.interactedElements.size;
      const urlsWithForms = metrics.urlsWithForms.size;
      const urlsWithErrors = metrics.urlsWithErrors.size;

      // Calculate a normalized coverage score (0-100)
      // This is a simple heuristic; could be more sophisticated
      const urlScore = Math.min(totalUrls * 5, 40); // Max 40 points for URLs
      const dialogScore = Math.min(totalDialogs * 5, 15); // Max 15 points for dialogs
      const formScore = Math.min(totalForms * 5, 20); // Max 20 points for forms
      const interactionScore = Math.min(totalInteractions * 0.5, 25); // Max 25 points for interactions

      const coverageScore = Math.min(100, urlScore + dialogScore + formScore + interactionScore);

      return {
        totalUrls,
        totalDialogs,
        totalForms,
        totalNetworkRequests,
        totalConsoleErrors,
        totalInteractions,
        urlsWithForms,
        urlsWithErrors,
        coverageScore,
      };
    },

    getMostEffectiveActionTypes(): Array<{ type: string; avgGain: number; count: number }> {
      const byType = new Map<string, { totalGain: number; count: number }>();

      for (const outcome of actionOutcomes) {
        const type = outcome.action.type;
        const existing = byType.get(type) || { totalGain: 0, count: 0 };
        existing.totalGain += outcome.coverageGain.totalGain;
        existing.count++;
        byType.set(type, existing);
      }

      return Array.from(byType.entries())
        .map(([type, { totalGain, count }]) => ({
          type,
          avgGain: count > 0 ? totalGain / count : 0,
          count,
        }))
        .sort((a, b) => b.avgGain - a.avgGain);
    },

    reset(): void {
      metrics.uniqueUrls.clear();
      metrics.uniqueDialogs.clear();
      metrics.uniqueForms.clear();
      metrics.uniqueNetworkRequests.clear();
      metrics.uniqueConsoleErrors.clear();
      metrics.interactedElements.clear();
      metrics.urlsWithForms.clear();
      metrics.urlsWithErrors.clear();
      actionOutcomes.length = 0;
    },
  };
}

// ============================================================================
// Coverage Collection Functions
// ============================================================================

/**
 * Collect coverage data from the current page
 */
export async function collectPageCoverage(
  browser: AgentBrowser,
  tracker: CoverageTracker,
  currentUrl: string
): Promise<void> {
  // Record the URL
  tracker.recordUrl(currentUrl);

  try {
    // Detect dialogs
    const dialogsJson = await browser.eval(DETECT_DIALOGS_SCRIPT);
    const dialogs = JSON.parse(dialogsJson) as string[];
    for (const dialog of dialogs) {
      tracker.recordDialog(dialog);
    }

    // Detect forms
    const formsJson = await browser.eval(DETECT_FORMS_SCRIPT);
    const forms = JSON.parse(formsJson) as string[];
    for (const form of forms) {
      tracker.recordForm(form);
    }

    if (forms.length > 0) {
      tracker.recordUrlWithForm(currentUrl);
    }
  } catch {
    // Ignore errors in coverage collection
  }
}

/**
 * Get coverage recommendations based on current state
 */
export function getCoverageRecommendations(tracker: CoverageTracker): CoverageRecommendation[] {
  const stats = tracker.getStats();
  const recommendations: CoverageRecommendation[] = [];

  if (stats.totalForms > stats.urlsWithForms) {
    recommendations.push({
      type: "explore_forms",
      priority: 8,
      message: `${stats.totalForms - stats.urlsWithForms} forms not yet interacted with`,
    });
  }

  if (stats.totalDialogs === 0) {
    recommendations.push({
      type: "find_dialogs",
      priority: 6,
      message: "No dialogs/modals discovered yet - look for modal triggers",
    });
  }

  if (stats.coverageScore < 50) {
    recommendations.push({
      type: "increase_breadth",
      priority: 7,
      message: "Coverage is low - explore more pages and interactions",
    });
  }

  const effectiveActions = tracker.getMostEffectiveActionTypes();
  if (effectiveActions.length > 0 && effectiveActions[0].avgGain > 2) {
    recommendations.push({
      type: "focus_action_type",
      priority: 5,
      message: `"${effectiveActions[0].type}" actions are most effective - prioritize them`,
    });
  }

  return recommendations.sort((a, b) => b.priority - a.priority);
}

export interface CoverageRecommendation {
  type: "explore_forms" | "find_dialogs" | "increase_breadth" | "focus_action_type" | "avoid_stagnation";
  priority: number;
  message: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize a URL for comparison
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash and lowercase
    return (parsed.origin + parsed.pathname.replace(/\/$/, "")).toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/$/, "");
  }
}

/**
 * Get items in set A that are not in set B
 */
function setDifference<T>(a: Set<T>, b: Set<T>): T[] {
  const result: T[] = [];
  for (const item of a) {
    if (!b.has(item)) {
      result.push(item);
    }
  }
  return result;
}

/**
 * Format coverage stats for display
 */
export function formatCoverageStats(stats: CoverageStats): string {
  return [
    `URLs: ${stats.totalUrls}`,
    `Forms: ${stats.totalForms} (${stats.urlsWithForms} pages with forms)`,
    `Dialogs: ${stats.totalDialogs}`,
    `Interactions: ${stats.totalInteractions}`,
    `Network Requests: ${stats.totalNetworkRequests}`,
    `Console Errors: ${stats.totalConsoleErrors}`,
    `Coverage Score: ${stats.coverageScore.toFixed(0)}/100`,
  ].join("\n");
}

