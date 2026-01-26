/**
 * PhaseIndicator Component
 *
 * Renders a single phase node in the timeline with:
 * - Clear visual distinction between pending, active, completed states
 * - Animated spinner for active state
 * - Progress ring for phases with measurable progress
 * - Accessible labels and ARIA attributes
 * - No false affordances (doesn't look clickable)
 */

import { cn } from "@/lib/utils";
import {
  Globe,
  Search,
  FileText,
  Play,
  Layers,
  BarChart3,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { PhaseMetadata, PhaseState, PhaseIcon } from "@/lib/progress-types";
import { getStatusAnnouncement, calculateProgress, formatProgress } from "@/lib/progress-types";

// Map icon identifiers to Lucide icons
const ICON_MAP: Record<PhaseIcon, typeof Globe> = {
  browser: Globe,
  search: Search,
  document: FileText,
  play: Play,
  layers: Layers,
  chart: BarChart3,
};

interface PhaseIndicatorProps {
  phase: PhaseMetadata;
  state: PhaseState;
  // Progress within this phase (for execution/traversal)
  progress?: { current: number; total: number };
  // Whether this is the current phase being viewed
  isCurrent?: boolean;
}

export function PhaseIndicator({
  phase,
  state,
  progress,
  isCurrent = false,
}: PhaseIndicatorProps) {
  const Icon = ICON_MAP[phase.icon];
  const isPending = state.status === "pending";
  const isActive = state.status === "active";
  const isCompleted = state.status === "completed";
  const isError = state.status === "error";
  const isSkipped = state.status === "skipped";

  // Calculate progress percentage for the ring
  const progressPercent = progress ? calculateProgress(progress.current, progress.total) : 0;
  const showProgressRing = isActive && progress && progress.total > 0;

  // Get announcement for screen readers
  const announcement = getStatusAnnouncement(phase, state);

  return (
    <div
      className="flex flex-col items-center"
      role="listitem"
      aria-label={announcement}
      aria-current={isActive ? "step" : undefined}
    >
      {/* Phase node container */}
      <div className="relative">
        {/* Progress ring (only shown for active phases with progress) */}
        {showProgressRing && (
          <svg
            className="absolute -inset-1 w-14 h-14"
            viewBox="0 0 56 56"
            aria-hidden="true"
          >
            {/* Background ring */}
            <circle
              cx="28"
              cy="28"
              r="25"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-muted/50"
            />
            {/* Progress ring */}
            <circle
              cx="28"
              cy="28"
              r="25"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              className="text-foreground transition-all duration-300"
              style={{
                strokeDasharray: `${2 * Math.PI * 25}`,
                strokeDashoffset: `${2 * Math.PI * 25 * (1 - progressPercent / 100)}`,
                transform: "rotate(-90deg)",
                transformOrigin: "center",
              }}
            />
          </svg>
        )}

        {/* Active pulse ring (decorative) */}
        {isActive && !showProgressRing && (
          <div
            className="absolute -inset-2 rounded-2xl border-2 border-foreground/20 animate-pulse"
            aria-hidden="true"
          />
        )}

        {/* Main node */}
        <div
          className={cn(
            "relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300",
            // Pending state: muted, not interactive
            isPending && "bg-muted border-2 border-muted text-muted-foreground",
            // Active state: prominent with animation
            isActive && "bg-background border-2 border-foreground text-foreground shadow-lg",
            // Completed state: filled, success indicator
            isCompleted && "bg-foreground border-2 border-foreground text-background",
            // Error state: error colors
            isError && "bg-red-500/10 border-2 border-red-500 text-red-500",
            // Skipped state: subtle
            isSkipped && "bg-muted/50 border-2 border-muted/50 text-muted-foreground/50"
          )}
        >
          {/* Icon based on state */}
          {isActive ? (
            <Loader2
              className="w-5 h-5 animate-spin"
              aria-hidden="true"
            />
          ) : isCompleted ? (
            <Check className="w-5 h-5" aria-hidden="true" />
          ) : isError ? (
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Icon className="w-5 h-5" aria-hidden="true" />
          )}
        </div>

        {/* Iteration badge (for repeated phases) */}
        {state.iterationCount > 1 && (
          <div
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center"
            aria-label={`Iteration ${state.iterationCount}`}
          >
            {state.iterationCount}
          </div>
        )}
      </div>

      {/* Labels */}
      <div className="mt-3 text-center max-w-20">
        <span
          className={cn(
            "text-sm font-medium block transition-colors",
            isPending && "text-muted-foreground",
            isActive && "text-foreground font-semibold",
            isCompleted && "text-foreground",
            isError && "text-red-500",
            isSkipped && "text-muted-foreground/50"
          )}
        >
          {phase.label}
        </span>

        {/* Status/activity text */}
        <span
          className={cn(
            "text-xs block transition-colors mt-0.5",
            isPending && "text-muted-foreground/60",
            isActive && "text-foreground/70",
            isCompleted && "text-muted-foreground",
            isError && "text-red-400",
            isSkipped && "text-muted-foreground/40"
          )}
        >
          {isActive && state.currentActivity
            ? state.currentActivity
            : phase.description}
        </span>

        {/* Progress text (bounded) */}
        {showProgressRing && progress && (
          <span
            className="text-xs font-mono text-foreground/80 mt-1 block"
            aria-label={`Progress: ${formatProgress(progress.current, progress.total)}`}
          >
            {formatProgress(progress.current, progress.total)}
          </span>
        )}
      </div>
    </div>
  );
}
