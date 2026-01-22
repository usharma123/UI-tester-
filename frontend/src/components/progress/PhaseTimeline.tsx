import { useAppStore } from "@/store/useAppStore";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { QAPhase } from "@/lib/types";

const PHASES: { key: QAPhase; label: string; description: string }[] = [
  { key: "init", label: "Init", description: "Starting up" },
  { key: "discovery", label: "Discover", description: "Analyzing site" },
  { key: "planning", label: "Plan", description: "Creating tests" },
  { key: "execution", label: "Execute", description: "Running tests" },
  { key: "traversal", label: "Traverse", description: "Multi-page scan" },
  { key: "evaluation", label: "Evaluate", description: "Final report" },
];

export function PhaseTimeline() {
  const phases = useAppStore((s) => s.phases);
  const currentStep = useAppStore((s) => s.currentStep);
  const totalSteps = useAppStore((s) => s.totalSteps);

  // Calculate progress percentage
  const completedPhases = PHASES.filter(
    (p) => phases[p.key].status === "completed"
  ).length;
  const progressPercent = (completedPhases / PHASES.length) * 100;

  return (
    <div className="py-8 px-6">
      {/* Progress track */}
      <div className="relative mb-8">
        <div className="absolute top-1/2 left-12 right-12 h-0.5 bg-muted -translate-y-1/2">
          <div
            className="h-full bg-foreground transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Phase nodes */}
        <div className="relative flex justify-between">
          {PHASES.map((phase, index) => {
            const state = phases[phase.key];
            const isActive = state.status === "active";
            const isComplete = state.status === "completed";

            return (
              <div key={phase.key} className="flex flex-col items-center flex-1">
                {/* Node */}
                <div
                  className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center font-mono text-sm font-semibold transition-all duration-300 border-2",
                    isComplete &&
                      "bg-foreground text-background border-foreground",
                    isActive &&
                      "bg-background border-foreground animate-pulse-subtle",
                    !isComplete &&
                      !isActive &&
                      "bg-muted border-muted text-muted-foreground"
                  )}
                >
                  {isComplete ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>

                {/* Label */}
                <div className="mt-3 text-center">
                  <span
                    className={cn(
                      "text-sm font-medium block",
                      isActive && "text-foreground",
                      isComplete && "text-foreground",
                      !isActive && !isComplete && "text-muted-foreground"
                    )}
                  >
                    {phase.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {phase.description}
                  </span>
                </div>

                {/* Step progress for execution phase */}
                {phase.key === "execution" && isActive && totalSteps > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <Progress
                      value={(currentStep / totalSteps) * 100}
                      className="w-14 h-1"
                    />
                    <span className="text-xs font-mono text-muted-foreground">
                      {currentStep}/{totalSteps}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
