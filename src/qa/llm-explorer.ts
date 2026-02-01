/**
 * LLM-Guided Explorer
 *
 * Main exploration loop using LLM-driven graph traversal.
 * Models the website as a graph and uses an LLM to decide
 * which actions to take at each node.
 */

import type { AgentBrowser, PageSnapshot } from "../agentBrowser.js";
import type { BudgetTracker } from "./budget.js";
import type { CoverageTracker } from "./coverage.js";
import type { StateTracker } from "./state.js";
import type {
  ExplorationGraph,
  GraphNode,
  GraphEdge,
  StackFrame,
  ElementInfo,
} from "./graph/types.js";
import type {
  DecisionEngine,
  CoverageContext,
  ExplorationHistoryEntry,
  LLMNavigatorConfig,
} from "./llm-navigator/types.js";
import { createExplorationGraph, generateEdgeId, DOM_SUMMARY_SCRIPT, GET_TITLE_SCRIPT, DETECT_SEARCH_SCRIPT, DETECT_FORMS_SCRIPT, COUNT_INTERACTIVE_SCRIPT } from "./graph/exploration-graph.js";
import { createDecisionEngine } from "./llm-navigator/decision-engine.js";
import { executeSmartInteraction, needsSmartInteraction } from "./llm-navigator/smart-interactions.js";
import { captureStateFingerprint } from "./state.js";
import { collectPageCoverage } from "./coverage.js";
import { extractActionCandidates, type ActionCandidate } from "./action-selector.js";

// ============================================================================
// Types
// ============================================================================

export interface LLMExplorerConfig {
  /** LLM navigator configuration */
  llmConfig: Partial<LLMNavigatorConfig>;
  /** Maximum depth for DFS exploration */
  maxDepth: number;
  /** Time to wait for stability after actions (ms) */
  stabilityWaitMs: number;
  /** Whether to take screenshots after each action */
  screenshotOnAction: boolean;
  /** Base domain to restrict exploration */
  baseDomain?: string;
}

export interface LLMExplorationResult {
  /** Graph of explored states */
  graph: ExplorationGraph;
  /** Total steps taken */
  totalSteps: number;
  /** Why exploration stopped */
  terminationReason: string;
  /** Duration in ms */
  durationMs: number;
  /** Unique URLs discovered */
  uniqueUrls: number;
  /** Unique states discovered */
  uniqueStates: number;
}

export interface LLMExplorerCallbacks {
  onStart?: () => void;
  onBeforeAction?: (edge: GraphEdge, depth: number) => void;
  onAfterAction?: (edge: GraphEdge, success: boolean, newState: boolean) => void;
  onBacktrack?: (toNode: GraphNode, depth: number) => void;
  onComplete?: (result: LLMExplorationResult) => void;
  onLog?: (message: string, level: "info" | "warn" | "error") => void;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_LLM_EXPLORER_CONFIG: LLMExplorerConfig = {
  llmConfig: {},
  maxDepth: 10,
  stabilityWaitMs: 300,
  screenshotOnAction: false,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return undefined;
  }
}

/**
 * Check if URL is on the same domain
 */
function isSameDomain(url: string, baseDomain: string | undefined): boolean {
  if (!baseDomain) return true;

  const targetDomain = extractDomain(url);
  if (!targetDomain) return false;

  return targetDomain === baseDomain || targetDomain.endsWith("." + baseDomain);
}

/**
 * Convert ActionCandidate to GraphEdge
 */
function candidateToEdge(candidate: ActionCandidate, sourceNodeId: string): GraphEdge {
  const element: ElementInfo = {
    tagName: candidate.element.tagName,
    text: candidate.element.text,
    role: candidate.element.role,
    href: candidate.element.href,
    type: candidate.element.type,
    formId: candidate.element.formId,
    isDisabled: candidate.element.isDisabled,
  };

  const edgeId = generateEdgeId(sourceNodeId, candidate.selector, candidate.actionType);

  return {
    id: edgeId,
    sourceNodeId,
    targetNodeId: null,
    action: {
      type: candidate.actionType,
      selector: candidate.selector,
      element,
    },
    status: "pending",
    attemptCount: 0,
  };
}

// ============================================================================
// LLM Explorer Implementation
// ============================================================================

/**
 * Create an LLM-guided explorer
 */
export function createLLMExplorer(
  browser: AgentBrowser,
  coverage: CoverageTracker,
  state: StateTracker,
  budget: BudgetTracker,
  apiKey: string,
  config: Partial<LLMExplorerConfig> = {}
): {
  explore: (startUrl: string, callbacks?: LLMExplorerCallbacks) => Promise<LLMExplorationResult>;
  stop: () => void;
} {
  const fullConfig: LLMExplorerConfig = {
    ...DEFAULT_LLM_EXPLORER_CONFIG,
    ...config,
  };

  const graph = createExplorationGraph();
  const decisionEngine = createDecisionEngine(apiKey, fullConfig.llmConfig);

  let stopped = false;
  let explorationStack: StackFrame[] = [];
  let explorationHistory: ExplorationHistoryEntry[] = [];
  let totalSteps = 0;
  let baseDomain: string | undefined = fullConfig.baseDomain;

  function log(callbacks: LLMExplorerCallbacks | undefined, message: string, level: "info" | "warn" | "error" = "info"): void {
    callbacks?.onLog?.(message, level);
  }

  /**
   * Capture a graph node from the current page state
   */
  async function captureNode(currentUrl: string, isMainEntry: boolean = false): Promise<GraphNode> {
    // Capture state fingerprint
    const fingerprint = await captureStateFingerprint(browser, currentUrl);

    // Get page information
    const [domSummary, title, hasSearchBox, hasForms, interactiveCount] = await Promise.all([
      browser.eval(DOM_SUMMARY_SCRIPT).catch(() => ""),
      browser.eval(GET_TITLE_SCRIPT).catch(() => ""),
      browser.eval(DETECT_SEARCH_SCRIPT).catch(() => "false"),
      browser.eval(DETECT_FORMS_SCRIPT).catch(() => "false"),
      browser.eval(COUNT_INTERACTIVE_SCRIPT).catch(() => "0"),
    ]);

    // Extract action candidates
    const candidates = await extractActionCandidates(browser);

    // Create node
    const node: GraphNode = {
      id: fingerprint.combinedHash,
      url: currentUrl,
      title: title,
      domSummary: domSummary,
      actions: [],
      visitCount: 1,
      explorationStatus: "unexplored",
      metadata: {
        hasSearchBox: hasSearchBox === "true" || hasSearchBox === true,
        hasForms: hasForms === "true" || hasForms === true,
        isMainEntryPoint: isMainEntry,
        interactiveElementCount: parseInt(String(interactiveCount), 10) || 0,
      },
      discoveredAt: Date.now(),
      lastVisitedAt: Date.now(),
    };

    // Convert candidates to edges (filter out disabled and external links)
    for (const candidate of candidates) {
      // Skip disabled elements
      if (candidate.element.isDisabled) continue;

      // Skip external links
      if (candidate.element.href && !isSameDomain(candidate.element.href, baseDomain)) {
        continue;
      }

      const edge = candidateToEdge(candidate, node.id);
      node.actions.push(edge);
    }

    return node;
  }

  /**
   * Execute an action (edge) and return whether it led to a new state
   */
  async function executeAction(
    edge: GraphEdge,
    callbacks: LLMExplorerCallbacks | undefined
  ): Promise<{ success: boolean; newState: boolean; stateChanged: boolean }> {
    const action = edge.action;

    try {
      // Take snapshot before
      const snapshotBefore = await browser.takePageSnapshot();
      const currentUrl = await browser.getCurrentUrl();

      // Execute based on action type
      if (needsSmartInteraction(edge)) {
        // Use smart interaction for fill actions on search/forms
        const node = graph.getNode(edge.sourceNodeId);
        const domSummary = node?.domSummary || "";

        const result = await executeSmartInteraction(
          browser,
          edge,
          domSummary,
          currentUrl,
          decisionEngine
        );

        if (!result.success) {
          throw new Error(result.error || "Smart interaction failed");
        }
      } else {
        // Regular action execution
        switch (action.type) {
          case "click":
            await browser.click(action.selector);
            break;
          case "fill":
            const value = edge.interactionHint || action.value || "test";
            await browser.fill(action.selector, value);
            break;
          case "hover":
            await browser.hover(action.selector);
            break;
          case "press":
            await browser.press("Enter");
            break;
          case "select":
            await browser.click(action.selector);
            break;
          default:
            await browser.click(action.selector);
        }
      }

      // Wait for stability
      await browser.waitForStability({ windowMs: fullConfig.stabilityWaitMs });

      // Take snapshot after
      const snapshotAfter = await browser.takePageSnapshot();

      // Determine if state changed
      const stateChanged = snapshotBefore.domHash !== snapshotAfter.domHash ||
                          snapshotBefore.url !== snapshotAfter.url;

      // Check if this is a new state in our graph
      const newUrl = await browser.getCurrentUrl();
      const newFingerprint = await captureStateFingerprint(browser, newUrl);
      const newState = !graph.hasNode(newFingerprint.combinedHash);

      // Record coverage
      coverage.recordElementInteraction(action.selector);
      await collectPageCoverage(browser, coverage, newUrl);

      return { success: true, newState, stateChanged };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(callbacks, `Action failed: ${errorMsg}`, "warn");
      return { success: false, newState: false, stateChanged: false };
    }
  }

  /**
   * Build coverage context for LLM decisions
   */
  function buildCoverageContext(): CoverageContext {
    const stats = coverage.getStats();
    const budgetStatus = budget.getStatus();

    return {
      urlCount: stats.totalUrls,
      formCount: stats.totalForms,
      searchCount: 0, // TODO: track search interactions separately
      totalSteps: totalSteps,
      currentDepth: budgetStatus.currentDepth,
    };
  }

  return {
    async explore(startUrl: string, callbacks?: LLMExplorerCallbacks): Promise<LLMExplorationResult> {
      const startTime = Date.now();
      let terminationReason = "budget_exhausted";

      callbacks?.onStart?.();

      try {
        // Navigate to start URL
        await browser.open(startUrl);

        // Set base domain from starting URL
        baseDomain = baseDomain || extractDomain(startUrl);
        log(callbacks, `Base domain set to: ${baseDomain}`);

        // Capture initial node
        const rootNode = await captureNode(startUrl, true);
        graph.addNode(rootNode);
        state.recordState(await captureStateFingerprint(browser, startUrl));

        log(callbacks, `Starting LLM-guided exploration at ${startUrl}`);
        log(callbacks, `Found ${rootNode.actions.length} initial actions`);

        // Initialize stack
        explorationStack = [{
          nodeId: rootNode.id,
          pendingEdges: [...rootNode.actions],
          depth: 0,
          returnAction: async () => {
            await browser.open(startUrl);
          },
        }];

        // Main exploration loop
        while (!stopped && budget.canContinue() && explorationStack.length > 0) {
          const frame = explorationStack[explorationStack.length - 1];
          const node = graph.getNode(frame.nodeId);

          if (!node) {
            log(callbacks, "Node not found, backtracking", "warn");
            explorationStack.pop();
            continue;
          }

          // Update budget with current state
          budget.setUniqueStates(graph.getStats().totalNodes);
          budget.setDepth(frame.depth);

          // Get pending edges for this frame
          const pendingEdges = frame.pendingEdges.filter(e => e.status === "pending");

          // Ask LLM which action to take
          const decisionContext = {
            node,
            pendingEdges,
            coverage: buildCoverageContext(),
            recentHistory: explorationHistory.slice(-10),
          };

          const decision = await decisionEngine.selectAction(decisionContext);

          // Check if branch is exhausted
          if (decision.branchExhausted || !decision.topAction) {
            log(callbacks, `Branch exhausted at depth ${frame.depth}: ${decision.exhaustedReason || "no actions"}`);

            // Mark node as exhausted
            graph.updateNode(node.id, { explorationStatus: "exhausted" });

            // Backtrack
            explorationStack.pop();

            if (explorationStack.length > 0) {
              const parentFrame = explorationStack[explorationStack.length - 1];
              const parentNode = graph.getNode(parentFrame.nodeId);

              if (parentNode) {
                callbacks?.onBacktrack?.(parentNode, parentFrame.depth);
                log(callbacks, `Backtracking to ${parentNode.url} (depth ${parentFrame.depth})`);

                // Execute return action to go back
                await parentFrame.returnAction();
              }
            }

            continue;
          }

          // Get the top action
          const edge = decision.topAction;

          // Apply interaction hint if provided
          if (decision.interactionHint) {
            edge.interactionHint = decision.interactionHint;
          }

          // Update LLM priority on edge
          const topDecision = decision.allDecisions.find(d => d.actionId === edge.id);
          if (topDecision) {
            graph.updateEdge(node.id, edge.id, {
              llmPriority: topDecision.priority,
              llmRationale: topDecision.rationale,
            });
          }

          callbacks?.onBeforeAction?.(edge, frame.depth);
          log(callbacks, `Executing: ${edge.action.type} on "${edge.action.element.text?.slice(0, 30) || edge.action.selector}"`);

          // Execute the action
          const result = await executeAction(edge, callbacks);
          totalSteps++;

          // Update edge status
          graph.updateEdge(node.id, edge.id, {
            status: result.success ? "explored" : "failed",
            attemptCount: edge.attemptCount + 1,
            lastAttemptAt: Date.now(),
            lastError: result.success ? undefined : "Action failed",
          });

          // Remove from pending edges
          frame.pendingEdges = frame.pendingEdges.filter(e => e.id !== edge.id);

          // Record in history
          const currentUrl = await browser.getCurrentUrl();
          explorationHistory.push({
            url: currentUrl,
            action: `${edge.action.type} "${edge.action.element.text?.slice(0, 20) || edge.action.selector}"`,
            newState: result.newState,
          });

          // Update budget
          budget.recordStep(result.newState);

          callbacks?.onAfterAction?.(edge, result.success, result.newState);

          // If we found a new state, push it onto the stack
          if (result.success && result.stateChanged) {
            // Check if we navigated to external domain
            if (!isSameDomain(currentUrl, baseDomain)) {
              log(callbacks, `Navigated to external domain, backtracking`, "warn");

              // Go back to parent
              await frame.returnAction();
              continue;
            }

            // Check max depth
            if (frame.depth >= fullConfig.maxDepth) {
              log(callbacks, `Max depth reached (${fullConfig.maxDepth})`);
              continue;
            }

            // Capture the new node
            const newNode = await captureNode(currentUrl);

            // Only push if this is truly a new node
            if (!graph.hasNode(newNode.id)) {
              graph.addNode(newNode);
              state.recordState(await captureStateFingerprint(browser, currentUrl));

              log(callbacks, `Discovered new state: ${newNode.url} (${newNode.actions.length} actions)`);

              // Link the edge to the new node
              graph.updateEdge(node.id, edge.id, { targetNodeId: newNode.id });

              // Create return action that chains back through the stack
              const parentFrame = frame;
              const newReturnAction = async () => {
                await parentFrame.returnAction();
                await executeAction(edge, callbacks);
              };

              // Push new frame
              explorationStack.push({
                nodeId: newNode.id,
                pendingEdges: [...newNode.actions],
                depth: frame.depth + 1,
                returnAction: newReturnAction,
              });
            }
          }
        }

        if (stopped) {
          terminationReason = "manual_stop";
        } else if (!budget.canContinue()) {
          const status = budget.getStatus();
          terminationReason = status.exhaustionReason || "budget_exhausted";
        } else if (explorationStack.length === 0) {
          terminationReason = "exploration_complete";
        }

        log(callbacks, `Exploration finished: ${terminationReason}`);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(callbacks, `Exploration error: ${errorMsg}`, "error");
        terminationReason = "error";
      }

      const stats = graph.getStats();
      const result: LLMExplorationResult = {
        graph,
        totalSteps,
        terminationReason,
        durationMs: Date.now() - startTime,
        uniqueUrls: coverage.getStats().totalUrls,
        uniqueStates: stats.totalNodes,
      };

      callbacks?.onComplete?.(result);
      return result;
    },

    stop(): void {
      stopped = true;
    },
  };
}
