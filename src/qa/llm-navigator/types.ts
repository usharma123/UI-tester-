/**
 * LLM Navigator Types
 *
 * Types for LLM-driven navigation decisions and smart interactions.
 */

import type { GraphEdge, GraphNode } from "../graph/types.js";

// ============================================================================
// LLM Decision Types
// ============================================================================

export interface ActionDecision {
  /** Edge/action ID being decided on */
  actionId: string;
  /** Priority score (1-10, higher = more important) */
  priority: number;
  /** LLM's reasoning for this priority */
  rationale: string;
  /** Optional hint for smart interaction (search query, form values) */
  interactionHint?: string;
}

export interface LLMDecisionResponse {
  /** Ordered list of action decisions */
  decisions: ActionDecision[];
  /** Whether this branch is considered exhausted */
  branchExhausted: boolean;
  /** Reason if branch is exhausted */
  exhaustedReason?: string;
  /** Any additional observations from the LLM */
  observations?: string;
}

export interface LLMDecisionContext {
  /** Current node being explored */
  node: GraphNode;
  /** Pending edges that haven't been explored */
  pendingEdges: GraphEdge[];
  /** Coverage statistics */
  coverage: CoverageContext;
  /** Exploration history for context */
  recentHistory: ExplorationHistoryEntry[];
}

export interface CoverageContext {
  /** Number of unique URLs visited */
  urlCount: number;
  /** Number of forms interacted with */
  formCount: number;
  /** Number of search interactions */
  searchCount: number;
  /** Total steps taken */
  totalSteps: number;
  /** Current exploration depth */
  currentDepth: number;
}

export interface ExplorationHistoryEntry {
  /** URL visited */
  url: string;
  /** Action taken */
  action: string;
  /** Whether it led to a new state */
  newState: boolean;
}

// ============================================================================
// Smart Interaction Types
// ============================================================================

export type SmartInteractionType = "search" | "form" | "filter" | "login";

export interface SmartInteractionRequest {
  /** Type of interaction */
  type: SmartInteractionType;
  /** URL of the page */
  url: string;
  /** CSS selector for the element */
  selector: string;
  /** Element placeholder text */
  placeholder?: string;
  /** Element aria-label */
  ariaLabel?: string;
  /** Page DOM summary for context */
  domSummary: string;
  /** Element type (input, select, etc.) */
  elementType: string;
}

export interface SmartInteractionResponse {
  /** Value to enter into the element */
  value: string;
  /** Time to wait after interaction (ms) */
  waitForMs: number;
  /** What to expect after the interaction */
  expectation: string;
  /** Whether to press Enter after filling */
  pressEnterAfter: boolean;
}

// ============================================================================
// LLM Navigator Config
// ============================================================================

export interface LLMNavigatorConfig {
  /** Whether LLM navigation is enabled */
  enabled: boolean;
  /** Model to use for navigation decisions */
  model: string;
  /** Temperature for LLM responses (0-1, lower = more deterministic) */
  temperature: number;
  /** Maximum LLM calls per exploration step */
  maxLLMCallsPerStep: number;
  /** Whether to use smart interactions for search/forms */
  smartInteractions: boolean;
  /** Maximum retries for LLM API calls */
  maxRetries: number;
  /** Timeout for LLM API calls in ms */
  timeoutMs: number;
  /** Whether to use heuristic-first decision making */
  enableHeuristicFirst: boolean;
  /** Confidence threshold for accepting heuristic decisions (0-100) */
  heuristicConfidenceThreshold: number;
  /** Maximum timeout for AI calls in ms */
  maxAITimeout: number;
  /** Maximum retries for AI calls */
  maxAIRetries: number;
}

export const DEFAULT_LLM_NAVIGATOR_CONFIG: LLMNavigatorConfig = {
  enabled: true,
  model: "anthropic/claude-sonnet-4-20250514",
  temperature: 0.3,
  maxLLMCallsPerStep: 2,
  smartInteractions: true,
  maxRetries: 2,
  timeoutMs: 30000,
  enableHeuristicFirst: true,
  heuristicConfidenceThreshold: 75,
  maxAITimeout: 10000,
  maxAIRetries: 1,
};

// ============================================================================
// Decision Engine Interface
// ============================================================================

export interface DecisionEngineStats {
  heuristicDecisions: number;
  aiEscalations: number;
  failures: number;
  totalDecisions: number;
}

export interface DecisionEngine {
  /** Select the next action to take based on current state */
  selectAction(context: LLMDecisionContext): Promise<LLMDecisionResult>;
  /** Generate smart interaction data for search/form elements */
  generateSmartInteraction(request: SmartInteractionRequest): Promise<SmartInteractionResponse>;
  /** Get the configuration */
  getConfig(): LLMNavigatorConfig;
  /** Get decision statistics */
  getStats(): DecisionEngineStats;
}

export interface LLMDecisionResult {
  /** The top action to execute */
  topAction: GraphEdge | null;
  /** All prioritized actions */
  allDecisions: ActionDecision[];
  /** Whether the branch is exhausted */
  branchExhausted: boolean;
  /** Reason for exhaustion */
  exhaustedReason?: string;
  /** Interaction hint for the top action */
  interactionHint?: string;
}

// ============================================================================
// Heuristic Decision Types
// ============================================================================

export type HeuristicDecision = "select_action" | "backtrack" | "uncertain";

export interface HeuristicResult {
  /** Decision made by heuristic */
  decision: HeuristicDecision;
  /** Selected edge ID if decision is 'select_action' */
  selectedEdge?: string;
  /** Confidence level 0-100 */
  confidence: number;
  /** Reasoning for this decision */
  reason: string;
  /** Additional metadata about the decision */
  metadata?: {
    scoreRatio?: number;
    candidateCount?: number;
    matchedPattern?: string;
  };
}

export interface FailureRecord {
  /** Node ID where failure occurred */
  nodeId: string;
  /** Approaches attempted before failure */
  attemptedApproaches: ("heuristic" | "ai")[];
  /** Reason for failure */
  reason: string;
  /** Timestamp of failure */
  timestamp: number;
}

// ============================================================================
// API Types
// ============================================================================

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}
