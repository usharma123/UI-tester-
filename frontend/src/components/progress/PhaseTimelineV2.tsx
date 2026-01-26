/**
 * PhaseTimeline V2 Component
 *
 * A redesigned progress timeline that:
 * - Clearly distinguishes phases from tasks
 * - Shows bounded progress that never exceeds limits
 * - Supports iterative workflows
 * - Has proper accessibility attributes
 * - Shows clear visual distinction for active phase
 */

import { useAppStore } from "@/store/useAppStore";
import { PhaseIndicator } from "./PhaseIndicator";
import { ActivePhaseDetail } from "./ActivePhaseDetail";
import {
  PHASE_CONFIG,
  type PhaseState,
  calculateProgress,
  createInitialPhaseState,
} from "@/lib/progress-types";
import type { QAPhase } from "@/lib/types";
import { cn } from "@/lib/utils";

// Map old phase state to new phase state format
function mapPhaseState(
  oldState: { status: "pending" | "active" | "completed" },
  currentActivity?: string
): PhaseState {
  return {
    status: oldState.status,
    tasks: [],
    iterationCount: oldState.status === "completed" ? 1 : 0,
    currentActivity,
  };
}

export function PhaseTimelineV2() {
  const phases = useAppStore((s) => s.phases);
  const currentStep = useAppStore((s) => s.currentStep);
  const totalSteps = useAppStore((s) => s.totalSteps);

  // Find the currently active phase
  const activePhaseKey = (Object.keys(phases) as QAPhase[]).find(
    (key) => phases[key].status === "active"
  );
  const activePhaseConfig = activePhaseKey
    ? PHASE_CONFIG.find((p) => p.key === activePhaseKey)
    : null;

  // Calculate overall progress (completed phases / total phases)
  const completedCount = PHASE_CONFIG.filter(
    (p) => phases[p.key].status === "completed"
  ).length;
  const overallProgress = calculateProgress(completedCount, PHASE_CONFIG.length);

  // Get progress for execution/traversal phases
  const getPhaseProgress = (phaseKey: QAPhase) => {
    if (
      (phaseKey === "execution" || phaseKey === "traversal") &&
      phases[phaseKey].status === "active" &&
      totalSteps > 0
    ) {
      return {
        // Clamp current to never exceed total
        current: Math.min(currentStep, totalSteps),
        total: totalSteps,
      };
    }
    return undefined;
  };

  // Get current activity description based on phase
  const getCurrentActivity = (phaseKey: QAPhase): string | undefined => {
    const phaseState = phases[phaseKey];
    if (phaseState.status !== "active") return undefined;

    switch (phaseKey) {
      case "init":
        return "Opening browser...";
      case "discovery":
        return "Analyzing site...";
      case "planning":
        return "Generating tests...";
      case "execution":
        return totalSteps > 0
          ? `Step ${Math.min(currentStep, totalSteps)} of ${totalSteps}`
          : "Preparing...";
      case "traversal":
        return totalSteps > 0
          ? `Page ${Math.min(currentStep, totalSteps)} of ${totalSteps}`
          : "Scanning pages...";
      case "evaluation":
        return "Scoring results...";
      default:
        return undefined;
    }
  };

  return (
    <div className="py-6 px-6">
      {/* Accessible label for the timeline */}
      <div className="sr-only" role="status" aria-live="polite">
        {activePhaseConfig
          ? `Currently in ${activePhaseConfig.label} phase. ${getCurrentActivity(activePhaseConfig.key) || ""}`
          : `Overall progress: ${Math.round(overallProgress)}%`}
      </div>

      {/* Progress track */}
      <div className="relative mb-6">
        {/* Track background */}
        <div
          className="absolute top-6 left-8 right-8 h-0.5 bg-muted"
          aria-hidden="true"
        />

        {/* Track fill */}
        <div
          className="absolute top-6 left-8 h-0.5 bg-foreground transition-all duration-500 ease-out"
          style={{ width: `calc(${overallProgress}% - 4rem)` }}
          aria-hidden="true"
        />

        {/* Phase nodes */}
        <div
          className="relative flex justify-between"
          role="list"
          aria-label="Test phases"
        >
          {PHASE_CONFIG.map((phase) => {
            const state = phases[phase.key];
            const progress = getPhaseProgress(phase.key);
            const activity = getCurrentActivity(phase.key);

            return (
              <PhaseIndicator
                key={phase.key}
                phase={phase}
                state={mapPhaseState(state, activity)}
                progress={progress}
                isCurrent={phase.key === activePhaseKey}
              />
            );
          })}
        </div>
      </div>

      {/* Active phase detail panel */}
      {activePhaseConfig && (
        <ActivePhaseDetail
          phase={activePhaseConfig}
          state={mapPhaseState(
            phases[activePhaseConfig.key],
            getCurrentActivity(activePhaseConfig.key)
          )}
          progress={getPhaseProgress(activePhaseConfig.key)}
        />
      )}
    </div>
  );
}
