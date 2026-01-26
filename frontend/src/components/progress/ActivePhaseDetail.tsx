/**
 * ActivePhaseDetail Component
 *
 * Shows detailed information about the currently active phase:
 * - Phase name and description
 * - Current activity/task
 * - Progress bar with bounded values
 * - Phase-specific elapsed time
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  type PhaseMetadata,
  type PhaseState,
  calculateProgress,
  formatProgress,
} from "@/lib/progress-types";
import { Loader2 } from "lucide-react";

interface ActivePhaseDetailProps {
  phase: PhaseMetadata;
  state: PhaseState;
  progress?: { current: number; total: number };
}

export function ActivePhaseDetail({
  phase,
  state,
  progress,
}: ActivePhaseDetailProps) {
  // Track phase elapsed time
  const [phaseElapsed, setPhaseElapsed] = useState(0);

  useEffect(() => {
    if (state.status !== "active") {
      setPhaseElapsed(0);
      return;
    }

    const startTime = state.startedAt || Date.now();
    setPhaseElapsed(0);

    const interval = setInterval(() => {
      setPhaseElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.status, state.startedAt, phase.key]);

  // Format elapsed time
  const formatElapsed = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate bounded progress
  const progressPercent = progress
    ? calculateProgress(progress.current, progress.total)
    : null;

  return (
    <div
      className="mt-4 p-4 bg-secondary/30 rounded-xl border border-border/50"
      role="region"
      aria-label={`${phase.label} phase details`}
    >
      <div className="flex items-center justify-between">
        {/* Left: Phase info and activity */}
        <div className="flex items-center gap-4">
          {/* Spinner */}
          <div
            className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center"
            aria-hidden="true"
          >
            <Loader2 className="w-5 h-5 text-foreground animate-spin" />
          </div>

          {/* Text content */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {phase.label}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full bg-foreground/10 text-foreground/70 font-medium"
                role="status"
              >
                In Progress
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {state.currentActivity || phase.description}
            </p>
          </div>
        </div>

        {/* Right: Timer */}
        <div
          className="text-right"
          aria-label={`Phase elapsed time: ${formatElapsed(phaseElapsed)}`}
        >
          <span className="text-xs text-muted-foreground block uppercase tracking-wider">
            Phase Time
          </span>
          <span className="text-lg font-mono font-semibold tabular-nums text-foreground">
            {formatElapsed(phaseElapsed)}
          </span>
        </div>
      </div>

      {/* Progress bar (if applicable) */}
      {progressPercent !== null && progress && (
        <div className="mt-4" role="progressbar" aria-valuenow={Math.round(progressPercent)} aria-valuemin={0} aria-valuemax={100}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Progress
            </span>
            <span className="text-xs font-mono text-foreground/80">
              {formatProgress(progress.current, progress.total)}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      )}

      {/* Iteration indicator (for repeated phases) */}
      {state.iterationCount > 1 && (
        <div
          className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"
          aria-label={`This phase has been run ${state.iterationCount} times`}
        >
          <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
            Iteration {state.iterationCount}
          </span>
          <span>This phase has been revisited</span>
        </div>
      )}
    </div>
  );
}
