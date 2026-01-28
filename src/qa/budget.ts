/**
 * Budget Management Module
 * 
 * Tracks and enforces exploration budget limits to prevent
 * infinite loops and ensure efficient resource usage.
 */

// ============================================================================
// Types
// ============================================================================

export interface BudgetConfig {
  /** Maximum steps allowed per unique page state (default: 10) */
  maxStepsPerPageState: number;
  /** Maximum unique states to visit (default: 100) */
  maxUniqueStates: number;
  /** Maximum total steps across all states (default: 500) */
  maxTotalSteps: number;
  /** Number of steps without coverage gain before stopping (default: 15) */
  stagnationThreshold: number;
  /** Maximum depth in the exploration tree (default: 10) */
  maxDepth: number;
  /** Time limit in milliseconds (default: 600000 = 10 minutes) */
  maxTimeMs: number;
}

export interface BudgetStatus {
  /** Total steps executed so far */
  stepsUsed: number;
  /** Number of unique states visited */
  uniqueStates: number;
  /** Current exploration depth */
  currentDepth: number;
  /** Steps since last coverage gain */
  stepsSinceLastGain: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Whether the budget allows continuing */
  canContinue: boolean;
  /** Reason if budget is exhausted */
  exhaustionReason?: BudgetExhaustionReason;
  /** Remaining budget as percentage (0-100) */
  remainingPercent: number;
}

export type BudgetExhaustionReason =
  | "max_steps_reached"
  | "max_states_reached"
  | "stagnation_detected"
  | "max_depth_reached"
  | "time_limit_exceeded"
  | "manual_stop";

export interface BudgetEvent {
  type: "step_recorded" | "coverage_gained" | "depth_changed" | "budget_warning" | "budget_exhausted";
  timestamp: number;
  details: Record<string, unknown>;
}

export interface BudgetTracker {
  /** Record a step was executed */
  recordStep(hadCoverageGain: boolean): void;
  /** Update the current exploration depth */
  setDepth(depth: number): void;
  /** Update the unique states count */
  setUniqueStates(count: number): void;
  /** Check if exploration can continue */
  canContinue(): boolean;
  /** Get the current budget status */
  getStatus(): BudgetStatus;
  /** Get remaining budget for a specific metric */
  getRemaining(metric: "steps" | "states" | "time"): number;
  /** Manually stop the exploration */
  stop(reason?: string): void;
  /** Reset the budget tracker */
  reset(): void;
  /** Get all budget events */
  getEvents(): BudgetEvent[];
  /** Get the budget configuration */
  getConfig(): BudgetConfig;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  maxStepsPerPageState: 10,
  maxUniqueStates: 100,
  maxTotalSteps: 500,
  stagnationThreshold: 15,
  maxDepth: 10,
  maxTimeMs: 600000, // 10 minutes
};

// ============================================================================
// Budget Tracker Implementation
// ============================================================================

/**
 * Create a budget tracker to monitor and enforce exploration limits
 */
export function createBudgetTracker(config: Partial<BudgetConfig> = {}): BudgetTracker {
  const fullConfig: BudgetConfig = {
    ...DEFAULT_BUDGET_CONFIG,
    ...config,
  };

  let stepsUsed = 0;
  let uniqueStates = 0;
  let currentDepth = 0;
  let stepsSinceLastGain = 0;
  let manuallyStopped = false;
  let manualStopReason: string | undefined;
  const startTime = Date.now();
  const events: BudgetEvent[] = [];

  function addEvent(type: BudgetEvent["type"], details: Record<string, unknown>): void {
    events.push({
      type,
      timestamp: Date.now(),
      details,
    });
  }

  function getElapsedMs(): number {
    return Date.now() - startTime;
  }

  function checkExhaustion(): BudgetExhaustionReason | undefined {
    if (manuallyStopped) {
      return "manual_stop";
    }

    if (stepsUsed >= fullConfig.maxTotalSteps) {
      return "max_steps_reached";
    }

    if (uniqueStates >= fullConfig.maxUniqueStates) {
      return "max_states_reached";
    }

    if (stepsSinceLastGain >= fullConfig.stagnationThreshold) {
      return "stagnation_detected";
    }

    if (currentDepth >= fullConfig.maxDepth) {
      return "max_depth_reached";
    }

    if (getElapsedMs() >= fullConfig.maxTimeMs) {
      return "time_limit_exceeded";
    }

    return undefined;
  }

  function calculateRemainingPercent(): number {
    // Calculate remaining percentage based on the most limiting factor
    const stepsPercent = ((fullConfig.maxTotalSteps - stepsUsed) / fullConfig.maxTotalSteps) * 100;
    const statesPercent = ((fullConfig.maxUniqueStates - uniqueStates) / fullConfig.maxUniqueStates) * 100;
    const timePercent = ((fullConfig.maxTimeMs - getElapsedMs()) / fullConfig.maxTimeMs) * 100;
    const stagnationPercent = ((fullConfig.stagnationThreshold - stepsSinceLastGain) / fullConfig.stagnationThreshold) * 100;

    return Math.max(0, Math.min(100, Math.min(stepsPercent, statesPercent, timePercent, stagnationPercent)));
  }

  return {
    recordStep(hadCoverageGain: boolean): void {
      stepsUsed++;

      if (hadCoverageGain) {
        stepsSinceLastGain = 0;
        addEvent("coverage_gained", { stepsUsed, totalGains: events.filter(e => e.type === "coverage_gained").length + 1 });
      } else {
        stepsSinceLastGain++;
      }

      addEvent("step_recorded", {
        stepsUsed,
        hadCoverageGain,
        stepsSinceLastGain,
      });

      // Check for warnings
      const remainingPercent = calculateRemainingPercent();
      if (remainingPercent <= 20 && remainingPercent > 10) {
        addEvent("budget_warning", {
          message: "Budget running low (20% remaining)",
          remainingPercent,
        });
      } else if (remainingPercent <= 10 && remainingPercent > 0) {
        addEvent("budget_warning", {
          message: "Budget critical (10% remaining)",
          remainingPercent,
        });
      }

      // Check for exhaustion
      const exhaustionReason = checkExhaustion();
      if (exhaustionReason) {
        addEvent("budget_exhausted", {
          reason: exhaustionReason,
          stepsUsed,
          uniqueStates,
          elapsedMs: getElapsedMs(),
        });
      }
    },

    setDepth(depth: number): void {
      const previousDepth = currentDepth;
      currentDepth = depth;

      if (depth !== previousDepth) {
        addEvent("depth_changed", {
          previousDepth,
          newDepth: depth,
        });
      }
    },

    setUniqueStates(count: number): void {
      uniqueStates = count;
    },

    canContinue(): boolean {
      return checkExhaustion() === undefined;
    },

    getStatus(): BudgetStatus {
      const exhaustionReason = checkExhaustion();

      return {
        stepsUsed,
        uniqueStates,
        currentDepth,
        stepsSinceLastGain,
        elapsedMs: getElapsedMs(),
        canContinue: exhaustionReason === undefined,
        exhaustionReason,
        remainingPercent: calculateRemainingPercent(),
      };
    },

    getRemaining(metric: "steps" | "states" | "time"): number {
      switch (metric) {
        case "steps":
          return Math.max(0, fullConfig.maxTotalSteps - stepsUsed);
        case "states":
          return Math.max(0, fullConfig.maxUniqueStates - uniqueStates);
        case "time":
          return Math.max(0, fullConfig.maxTimeMs - getElapsedMs());
        default:
          return 0;
      }
    },

    stop(reason?: string): void {
      manuallyStopped = true;
      manualStopReason = reason;
      addEvent("budget_exhausted", {
        reason: "manual_stop",
        manualStopReason: reason,
        stepsUsed,
        uniqueStates,
        elapsedMs: getElapsedMs(),
      });
    },

    reset(): void {
      stepsUsed = 0;
      uniqueStates = 0;
      currentDepth = 0;
      stepsSinceLastGain = 0;
      manuallyStopped = false;
      manualStopReason = undefined;
      events.length = 0;
    },

    getEvents(): BudgetEvent[] {
      return [...events];
    },

    getConfig(): BudgetConfig {
      return { ...fullConfig };
    },
  };
}

// ============================================================================
// Budget Utilities
// ============================================================================

/**
 * Estimate the budget needed for a given number of pages
 */
export function estimateBudget(pageCount: number, stepsPerPage: number = 5): Partial<BudgetConfig> {
  return {
    maxTotalSteps: pageCount * stepsPerPage * 2, // 2x buffer
    maxUniqueStates: pageCount * 3, // Expect ~3 states per page (base, form filled, modal open)
    maxTimeMs: Math.max(300000, pageCount * 30000), // 30 seconds per page, min 5 minutes
  };
}

/**
 * Format budget status for display
 */
export function formatBudgetStatus(status: BudgetStatus): string {
  const lines: string[] = [];

  lines.push(`Steps: ${status.stepsUsed} (${status.remainingPercent.toFixed(0)}% budget remaining)`);
  lines.push(`Unique States: ${status.uniqueStates}`);
  lines.push(`Depth: ${status.currentDepth}`);
  lines.push(`Elapsed: ${(status.elapsedMs / 1000).toFixed(1)}s`);

  if (status.stepsSinceLastGain > 0) {
    lines.push(`Steps without gain: ${status.stepsSinceLastGain}`);
  }

  if (!status.canContinue && status.exhaustionReason) {
    lines.push(`Status: Stopped (${formatExhaustionReason(status.exhaustionReason)})`);
  } else {
    lines.push(`Status: Active`);
  }

  return lines.join("\n");
}

/**
 * Format exhaustion reason for display
 */
export function formatExhaustionReason(reason: BudgetExhaustionReason): string {
  const messages: Record<BudgetExhaustionReason, string> = {
    max_steps_reached: "Maximum steps reached",
    max_states_reached: "Maximum unique states reached",
    stagnation_detected: "No coverage gain detected (stagnation)",
    max_depth_reached: "Maximum exploration depth reached",
    time_limit_exceeded: "Time limit exceeded",
    manual_stop: "Manually stopped",
  };

  return messages[reason] || reason;
}

