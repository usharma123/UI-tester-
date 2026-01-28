/**
 * Coverage-Guided Exploration Engine
 * 
 * Orchestrates the exploration of a web application using coverage-guided
 * search with beam search and best-first exploration strategies.
 */

import type { AgentBrowser, PageSnapshot, ActionOutcome as BrowserActionOutcome } from "../agentBrowser.js";
import type { StateFingerprint, StateTracker } from "./state.js";
import type { BudgetTracker } from "./budget.js";
import type { CoverageTracker, CoverageSnapshot, CoverageGain } from "./coverage.js";
import type { ActionCandidate, ActionSelector, ScoringContext } from "./action-selector.js";
import { captureStateFingerprint } from "./state.js";
import { collectPageCoverage } from "./coverage.js";
import { extractActionCandidates, buildScoringContext, createActionSelector } from "./action-selector.js";

// ============================================================================
// Types
// ============================================================================

export type ExplorationStrategy = "coverage_guided" | "breadth_first" | "depth_first" | "random";

export interface ExplorationConfig {
  /** Exploration strategy to use (default: coverage_guided) */
  strategy: ExplorationStrategy;
  /** Beam width for beam search (default: 3) */
  beamWidth: number;
  /** Maximum depth for depth-first exploration (default: 10) */
  maxDepth: number;
  /** Whether to backtrack on dead ends (default: true) */
  enableBacktracking: boolean;
  /** Time to wait for stability after actions (default: 300ms) */
  stabilityWaitMs: number;
  /** Whether to take screenshots after each action (default: false) */
  screenshotOnAction: boolean;
}

export interface ExplorationStep {
  /** Step index in the exploration */
  index: number;
  /** Action that was performed */
  action: ActionCandidate;
  /** State before the action */
  stateBefore: StateFingerprint;
  /** State after the action */
  stateAfter: StateFingerprint;
  /** Coverage gain from this action */
  coverageGain: CoverageGain;
  /** Browser action outcome */
  browserOutcome: BrowserActionOutcome;
  /** Whether this was a successful exploration step */
  success: boolean;
  /** Error if the step failed */
  error?: string;
  /** Screenshot path if taken */
  screenshotPath?: string;
  /** Timestamp */
  timestamp: number;
}

export interface ExplorationResult {
  /** All exploration steps taken */
  steps: ExplorationStep[];
  /** Final coverage metrics */
  coverageSnapshot: CoverageSnapshot;
  /** Why exploration stopped */
  terminationReason: ExplorationTerminationReason;
  /** Total time taken in ms */
  durationMs: number;
  /** Number of unique states discovered */
  uniqueStates: number;
}

export type ExplorationTerminationReason =
  | "budget_exhausted"
  | "no_actions_available"
  | "coverage_complete"
  | "max_depth_reached"
  | "error"
  | "manual_stop";

export interface ExplorationCallbacks {
  /** Called when exploration starts */
  onStart?: () => void;
  /** Called before each action */
  onBeforeAction?: (action: ActionCandidate, stepIndex: number) => void;
  /** Called after each action */
  onAfterAction?: (step: ExplorationStep) => void;
  /** Called when exploration completes */
  onComplete?: (result: ExplorationResult) => void;
  /** Called on error */
  onError?: (error: Error, stepIndex: number) => void;
  /** Called to log messages */
  onLog?: (message: string, level: "info" | "warn" | "error") => void;
}

export interface Explorer {
  /** Start exploration from the current page */
  explore(callbacks?: ExplorationCallbacks): Promise<ExplorationResult>;
  /** Select the next actions to try based on current state */
  selectNextActions(candidates: ActionCandidate[], n?: number): ActionCandidate[];
  /** Execute a single exploration step */
  executeStep(action: ActionCandidate): Promise<ExplorationStep>;
  /** Stop exploration */
  stop(reason?: string): void;
  /** Get current exploration depth */
  getDepth(): number;
  /** Reset the explorer */
  reset(): void;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_EXPLORATION_CONFIG: ExplorationConfig = {
  strategy: "coverage_guided",
  beamWidth: 3,
  maxDepth: 10,
  enableBacktracking: true,
  stabilityWaitMs: 300,
  screenshotOnAction: false,
};

// ============================================================================
// Explorer Implementation
// ============================================================================

/**
 * Extract the domain from a URL
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
 * Create a coverage-guided explorer
 */
export function createExplorer(
  browser: AgentBrowser,
  coverage: CoverageTracker,
  state: StateTracker,
  budget: BudgetTracker,
  config: Partial<ExplorationConfig> = {}
): Explorer {
  const fullConfig: ExplorationConfig = {
    ...DEFAULT_EXPLORATION_CONFIG,
    ...config,
  };

  const actionSelector = createActionSelector();
  let currentDepth = 0;
  let stepIndex = 0;
  let stopped = false;
  let stopReason: string | undefined;

  // Base domain to restrict exploration (set on first URL)
  let baseDomain: string | undefined;

  // Current URL (updated as we navigate)
  let currentUrl: string = "";

  // Backtracking stack for depth-first exploration
  const backtrackStack: Array<{
    url: string;
    stateFingerprint: StateFingerprint;
    remainingActions: ActionCandidate[];
  }> = [];

  function log(
    callbacks: ExplorationCallbacks | undefined,
    message: string,
    level: "info" | "warn" | "error" = "info"
  ): void {
    if (callbacks?.onLog) {
      callbacks.onLog(message, level);
    }
  }

  return {
    async explore(callbacks?: ExplorationCallbacks): Promise<ExplorationResult> {
      const startTime = Date.now();
      const steps: ExplorationStep[] = [];
      let terminationReason: ExplorationTerminationReason = "budget_exhausted";

      callbacks?.onStart?.();

      try {
        // Initial coverage collection
        currentUrl = await browser.getCurrentUrl();
        await collectPageCoverage(browser, coverage, currentUrl);

        // Set base domain from starting URL to prevent external navigation
        baseDomain = extractDomain(currentUrl);
        log(callbacks, `Base domain set to: ${baseDomain}`);

        // Capture initial state
        const initialState = await captureStateFingerprint(browser, currentUrl);
        state.recordState(initialState);

        log(callbacks, `Starting exploration at ${currentUrl}`);

        // Main exploration loop
        while (!stopped && budget.canContinue()) {
          // Update budget with current state count
          budget.setUniqueStates(state.getUniqueStateCount());
          budget.setDepth(currentDepth);

          // Get action candidates
          const candidates = await extractActionCandidates(browser);
          if (candidates.length === 0) {
            log(callbacks, "No action candidates found", "warn");

            // Try backtracking if enabled
            if (fullConfig.enableBacktracking && backtrackStack.length > 0) {
              const backtrackPoint = backtrackStack.pop()!;
              log(callbacks, `Backtracking to ${backtrackPoint.url}`);
              await browser.open(backtrackPoint.url);
              currentUrl = backtrackPoint.url;
              currentDepth = Math.max(0, currentDepth - 1);
              continue;
            }

            terminationReason = "no_actions_available";
            break;
          }

          // Select next actions
          const nextActions = this.selectNextActions(candidates, fullConfig.beamWidth);
          if (nextActions.length === 0) {
            log(callbacks, "No promising actions to try", "warn");
            terminationReason = "no_actions_available";
            break;
          }

          // Execute the top action
          const action = nextActions[0];
          callbacks?.onBeforeAction?.(action, stepIndex);

          try {
            const step = await this.executeStep(action);
            steps.push(step);

            callbacks?.onAfterAction?.(step);

            // Update current URL after action
            currentUrl = await browser.getCurrentUrl();

            // Check if we've navigated to an external domain
            const currentDomain = extractDomain(currentUrl);
            if (baseDomain && currentDomain && currentDomain !== baseDomain && !currentDomain.endsWith('.' + baseDomain)) {
              log(callbacks, `Navigated to external domain ${currentDomain}, backtracking`, "warn");
              if (fullConfig.enableBacktracking && backtrackStack.length > 0) {
                const backtrackPoint = backtrackStack.pop()!;
                await browser.open(backtrackPoint.url);
                currentUrl = backtrackPoint.url;
                currentDepth = Math.max(0, currentDepth - 1);
                continue;
              }
            }

            // Update budget with coverage gain
            budget.recordStep(step.coverageGain.hasGain);

            // If action led to new state, increase depth
            if (step.stateAfter.combinedHash !== step.stateBefore.combinedHash) {
              currentDepth++;

              // Save backtrack point if we have remaining actions
              if (fullConfig.enableBacktracking && nextActions.length > 1) {
                backtrackStack.push({
                  url: currentUrl,
                  stateFingerprint: step.stateBefore,
                  remainingActions: nextActions.slice(1),
                });
              }
            }

            // Check for max depth
            if (currentDepth >= fullConfig.maxDepth) {
              if (fullConfig.enableBacktracking && backtrackStack.length > 0) {
                const backtrackPoint = backtrackStack.pop()!;
                log(callbacks, `Max depth reached, backtracking to ${backtrackPoint.url}`);
                await browser.open(backtrackPoint.url);
                currentUrl = backtrackPoint.url;
                currentDepth = Math.max(0, currentDepth - 1);
              } else {
                log(callbacks, "Max depth reached");
                terminationReason = "max_depth_reached";
                break;
              }
            }

            stepIndex++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(callbacks, `Action failed: ${errorMessage}`, "error");
            callbacks?.onError?.(error instanceof Error ? error : new Error(errorMessage), stepIndex);

            // Record the failed attempt
            actionSelector.recordAttempt(action.selector, action.actionType);
            stepIndex++;
          }
        }

        if (stopped) {
          terminationReason = "manual_stop";
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(callbacks, `Exploration error: ${errorMessage}`, "error");
        terminationReason = "error";
      }

      const result: ExplorationResult = {
        steps,
        coverageSnapshot: coverage.takeSnapshot(stepIndex),
        terminationReason,
        durationMs: Date.now() - startTime,
        uniqueStates: state.getUniqueStateCount(),
      };

      callbacks?.onComplete?.(result);
      return result;
    },

    selectNextActions(candidates: ActionCandidate[], n?: number): ActionCandidate[] {
      const context = buildScoringContext(coverage, state, currentUrl, baseDomain);
      const beamWidth = n ?? fullConfig.beamWidth;

      switch (fullConfig.strategy) {
        case "coverage_guided":
          // Use action selector with all scoring factors
          return actionSelector.selectTopActions(candidates, context, beamWidth);

        case "breadth_first":
          // Prioritize actions that lead to new URLs
          return actionSelector
            .rankActions(candidates, context)
            .filter(c => c.element.href && !context.visitedUrls.has(c.element.href))
            .slice(0, beamWidth);

        case "depth_first":
          // Prioritize the first unvisited action
          const unvisited = actionSelector
            .rankActions(candidates, context)
            .filter(c => !c.wasAttempted);
          return unvisited.length > 0 ? [unvisited[0]] : [];

        case "random":
          // Shuffle and return random candidates
          const shuffled = [...candidates].sort(() => Math.random() - 0.5);
          return shuffled.slice(0, beamWidth);

        default:
          return actionSelector.selectTopActions(candidates, context, beamWidth);
      }
    },

    async executeStep(action: ActionCandidate): Promise<ExplorationStep> {
      const timestamp = Date.now();

      // Capture state before
      const currentUrl = await browser.getCurrentUrl();
      const stateBefore = await captureStateFingerprint(browser, currentUrl);
      const coverageBefore = coverage.takeSnapshot(stepIndex);
      const pageSnapshotBefore = await browser.takePageSnapshot();

      // Execute the action
      let success = true;
      let error: string | undefined;
      let screenshotPath: string | undefined;

      try {
        switch (action.actionType) {
          case "click":
            await browser.click(action.selector);
            break;
          case "fill":
            // For fill actions, we need test data
            const testValue = getTestValue(action.element);
            await browser.fill(action.selector, testValue);
            break;
          case "hover":
            await browser.hover(action.selector);
            break;
          case "press":
            await browser.press("Enter");
            break;
          case "select":
            // Select first option by clicking
            await browser.click(action.selector);
            break;
          default:
            await browser.click(action.selector);
        }

        // Wait for stability
        await browser.waitForStability({
          windowMs: fullConfig.stabilityWaitMs,
        });

        // Record the element interaction
        coverage.recordElementInteraction(action.selector);
      } catch (e) {
        success = false;
        error = e instanceof Error ? e.message : String(e);
      }

      // Capture state after
      const newUrl = await browser.getCurrentUrl();
      const stateAfter = await captureStateFingerprint(browser, newUrl);
      const pageSnapshotAfter = await browser.takePageSnapshot();

      // Collect coverage from new state
      await collectPageCoverage(browser, coverage, newUrl);

      // Calculate coverage gain
      const coverageGain = coverage.calculateGain(coverageBefore);

      // Record state transition
      state.recordTransition({
        fromState: stateBefore,
        toState: stateAfter,
        action: {
          type: action.actionType,
          selector: action.selector,
        },
        timestamp,
      });

      // Record action attempt
      actionSelector.recordAttempt(action.selector, action.actionType);

      // Detect browser action outcome
      const browserOutcome = browser.detectActionOutcome(pageSnapshotBefore, pageSnapshotAfter);

      // Record coverage outcome
      coverage.recordActionOutcome({
        action: {
          type: action.actionType,
          selector: action.selector,
        },
        coverageGain,
        stepIndex,
        timestamp,
      });

      return {
        index: stepIndex,
        action,
        stateBefore,
        stateAfter,
        coverageGain,
        browserOutcome,
        success,
        error,
        screenshotPath,
        timestamp,
      };
    },

    stop(reason?: string): void {
      stopped = true;
      stopReason = reason;
    },

    getDepth(): number {
      return currentDepth;
    },

    reset(): void {
      currentDepth = 0;
      stepIndex = 0;
      stopped = false;
      stopReason = undefined;
      backtrackStack.length = 0;
      baseDomain = undefined;
      currentUrl = "";
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a test value for filling form fields
 */
function getTestValue(element: ActionCandidate["element"]): string {
  const type = (element.type || "").toLowerCase();
  const name = (element.text || "").toLowerCase();

  // Email fields
  if (type === "email" || name.includes("email")) {
    return "test@example.com";
  }

  // Password fields
  if (type === "password" || name.includes("password")) {
    return "TestPassword123!";
  }

  // Phone fields
  if (type === "tel" || name.includes("phone") || name.includes("tel")) {
    return "555-123-4567";
  }

  // URL fields
  if (type === "url" || name.includes("url") || name.includes("website")) {
    return "https://example.com";
  }

  // Number fields
  if (type === "number") {
    return "42";
  }

  // Search fields
  if (type === "search" || name.includes("search") || name.includes("query")) {
    return "test search query";
  }

  // Name fields
  if (name.includes("name")) {
    if (name.includes("first")) return "John";
    if (name.includes("last")) return "Doe";
    return "John Doe";
  }

  // Address fields
  if (name.includes("address") || name.includes("street")) {
    return "123 Test Street";
  }

  // City fields
  if (name.includes("city")) {
    return "Test City";
  }

  // Zip/postal code
  if (name.includes("zip") || name.includes("postal")) {
    return "12345";
  }

  // Default text value
  return "Test Value";
}

/**
 * Format exploration result for display
 */
export function formatExplorationResult(result: ExplorationResult): string {
  const lines: string[] = [];

  lines.push(`Exploration completed: ${result.terminationReason}`);
  lines.push(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  lines.push(`Steps: ${result.steps.length}`);
  lines.push(`Unique states: ${result.uniqueStates}`);
  lines.push(`Coverage score: ${result.coverageSnapshot.metrics.uniqueUrls.size} URLs`);

  return lines.join("\n");
}

