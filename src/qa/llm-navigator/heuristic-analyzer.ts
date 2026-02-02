/**
 * Heuristic Analyzer
 *
 * Fast-path decision making for obvious action selections.
 * Returns high-confidence decisions for clear-cut cases, escalates
 * uncertain situations to AI.
 */

import type { GraphEdge, GraphNode } from "../graph/types.js";
import type { HeuristicResult } from "./types.js";
import {
  createActionSelector,
  type ActionCandidate,
  type ScoringContext,
} from "../action-selector.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * CTA keywords that indicate high-priority call-to-action buttons
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
  "login", "log in", "sign in",
];

/**
 * Navigation keywords for important navigation elements
 */
const NAV_KEYWORDS = [
  "home", "about", "contact", "pricing", "features",
  "products", "services", "blog", "news",
  "support", "help", "faq", "docs", "documentation",
  "dashboard", "account", "profile", "settings",
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if element text contains a CTA keyword
 */
function isCTAButton(edge: GraphEdge): boolean {
  const text = edge.action.element.text.toLowerCase();
  const tagName = edge.action.element.tagName.toLowerCase();
  const isButton = tagName === "button" || edge.action.element.role === "button";

  return isButton && CTA_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * Check if element is a navigation link
 */
function isNavigationLink(edge: GraphEdge): boolean {
  const text = edge.action.element.text.toLowerCase();
  const tagName = edge.action.element.tagName.toLowerCase();
  const hasHref = !!edge.action.element.href;

  return (tagName === "a" || hasHref) && NAV_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * Check if action leads to a novel URL
 */
function leadsToNovelUrl(edge: GraphEdge, visitedUrls: Set<string>, currentUrl: string): boolean {
  if (!edge.action.element.href) return false;

  try {
    const targetUrl = new URL(edge.action.element.href, currentUrl).href;
    return !visitedUrls.has(targetUrl);
  } catch {
    return false;
  }
}

/**
 * Convert GraphEdge to ActionCandidate for scoring
 */
function edgeToCandidate(edge: GraphEdge): ActionCandidate {
  return {
    selector: edge.action.selector,
    actionType: edge.action.type,
    priorityScore: 0,
    scoreBreakdown: {
      novelty: 0,
      businessCriticality: 0,
      risk: 0,
      branchFactor: 0,
    },
    element: {
      tagName: edge.action.element.tagName,
      text: edge.action.element.text,
      role: edge.action.element.role,
      href: edge.action.element.href,
      type: edge.action.element.type,
      formId: edge.action.element.formId,
      isDisabled: edge.action.element.isDisabled,
    },
    wasAttempted: edge.attemptCount > 0,
    decayFactor: 1,
  };
}

// ============================================================================
// Heuristic Analyzer
// ============================================================================

export interface HeuristicAnalyzerConfig {
  /** Confidence threshold for accepting heuristic decisions (0-100) */
  confidenceThreshold: number;
  /** Minimum score ratio for dominant action selection (e.g., 2.0 = 2x higher) */
  dominantScoreRatio: number;
}

const DEFAULT_CONFIG: HeuristicAnalyzerConfig = {
  confidenceThreshold: 75,
  dominantScoreRatio: 2.0,
};

export class HeuristicAnalyzer {
  private actionSelector = createActionSelector();
  private config: HeuristicAnalyzerConfig;

  constructor(config: Partial<HeuristicAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze node and edges to make a fast decision
   */
  analyze(
    node: GraphNode,
    pendingEdges: GraphEdge[],
    exploredEdges: GraphEdge[],
    visitedUrls: Set<string>
  ): HeuristicResult {
    // Rule 1: No pending actions → backtrack
    if (pendingEdges.length === 0) {
      return {
        decision: "backtrack",
        confidence: 100,
        reason: "no_pending_actions",
        metadata: { candidateCount: 0 },
      };
    }

    // Rule 2: Single action → take it
    if (pendingEdges.length === 1) {
      return {
        decision: "select_action",
        selectedEdge: pendingEdges[0].id,
        confidence: 100,
        reason: "only_option",
        metadata: { candidateCount: 1 },
      };
    }

    // Convert edges to candidates for scoring
    const candidates = pendingEdges.map(edgeToCandidate);

    // Build scoring context
    const scoringContext: ScoringContext = {
      visitedUrls,
      submittedForms: new Set(), // Could be enhanced with actual tracking
      openedDialogs: new Set(),
      interactedElements: new Set(exploredEdges.map(e => e.action.selector)),
      actionTypeCounts: new Map(),
      currentUrl: node.url,
    };

    // Score all candidates
    const scoredCandidates = this.actionSelector.rankActions(candidates, scoringContext);

    if (scoredCandidates.length === 0) {
      return {
        decision: "backtrack",
        confidence: 100,
        reason: "no_valid_candidates",
        metadata: { candidateCount: 0 },
      };
    }

    const topScore = scoredCandidates[0].priorityScore;
    const secondScore = scoredCandidates[1]?.priorityScore ?? 0;
    const topCandidate = scoredCandidates[0];
    const topEdge = pendingEdges.find(e => e.action.selector === topCandidate.selector);

    if (!topEdge) {
      return {
        decision: "uncertain",
        confidence: 0,
        reason: "edge_not_found",
      };
    }

    // Rule 3: Dominant score (significantly higher than alternatives)
    if (topScore > 30 && topScore >= this.config.dominantScoreRatio * secondScore) {
      return {
        decision: "select_action",
        selectedEdge: topEdge.id,
        confidence: 95,
        reason: "dominant_score",
        metadata: {
          scoreRatio: secondScore > 0 ? topScore / secondScore : Infinity,
          candidateCount: pendingEdges.length,
        },
      };
    }

    // Rule 4: CTA button detection
    const ctaButton = pendingEdges.find(e => isCTAButton(e));
    if (ctaButton && topEdge.id === ctaButton.id) {
      return {
        decision: "select_action",
        selectedEdge: ctaButton.id,
        confidence: 90,
        reason: "cta_button",
        metadata: {
          matchedPattern: "cta",
          candidateCount: pendingEdges.length,
        },
      };
    }

    // Rule 5: Navigation link to unexplored URL
    const navLink = pendingEdges.find(e =>
      isNavigationLink(e) && leadsToNovelUrl(e, visitedUrls, node.url)
    );
    if (navLink && topEdge.id === navLink.id) {
      return {
        decision: "select_action",
        selectedEdge: navLink.id,
        confidence: 85,
        reason: "navigation_to_new_url",
        metadata: {
          matchedPattern: "nav_link",
          candidateCount: pendingEdges.length,
        },
      };
    }

    // Rule 6: Novel URL with high score
    if (topScore > 20 && leadsToNovelUrl(topEdge, visitedUrls, node.url)) {
      return {
        decision: "select_action",
        selectedEdge: topEdge.id,
        confidence: 80,
        reason: "novel_url_exploration",
        metadata: {
          candidateCount: pendingEdges.length,
        },
      };
    }

    // Rule 7: High score with no strong alternatives
    if (topScore > 25 && topScore >= 1.5 * secondScore) {
      return {
        decision: "select_action",
        selectedEdge: topEdge.id,
        confidence: 75,
        reason: "high_score_clear_leader",
        metadata: {
          scoreRatio: secondScore > 0 ? topScore / secondScore : Infinity,
          candidateCount: pendingEdges.length,
        },
      };
    }

    // Uncertain - multiple good candidates, need AI to decide
    return {
      decision: "uncertain",
      confidence: 0,
      reason: "multiple_viable_candidates",
      metadata: {
        candidateCount: pendingEdges.length,
        scoreRatio: secondScore > 0 ? topScore / secondScore : Infinity,
      },
    };
  }

  /**
   * Check if heuristic decision should be accepted based on confidence
   */
  shouldAccept(result: HeuristicResult): boolean {
    return result.confidence >= this.config.confidenceThreshold;
  }

  /**
   * Get the top N candidates for AI escalation
   */
  getTopCandidatesForAI(
    pendingEdges: GraphEdge[],
    visitedUrls: Set<string>,
    currentUrl: string,
    n: number = 5
  ): GraphEdge[] {
    const candidates = pendingEdges.map(edgeToCandidate);

    const scoringContext: ScoringContext = {
      visitedUrls,
      submittedForms: new Set(),
      openedDialogs: new Set(),
      interactedElements: new Set(),
      actionTypeCounts: new Map(),
      currentUrl,
    };

    const scored = this.actionSelector.rankActions(candidates, scoringContext);
    const topSelectors = scored.slice(0, n).map(c => c.selector);

    return pendingEdges.filter(e => topSelectors.includes(e.action.selector));
  }
}

/**
 * Create a heuristic analyzer instance
 */
export function createHeuristicAnalyzer(
  config: Partial<HeuristicAnalyzerConfig> = {}
): HeuristicAnalyzer {
  return new HeuristicAnalyzer(config);
}
