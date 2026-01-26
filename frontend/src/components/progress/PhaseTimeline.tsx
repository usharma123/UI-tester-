import { useAppStore } from "@/store/useAppStore";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Check, Globe, Search, FileText, Play, Compass, BarChart3 } from "lucide-react";
import type { QAPhase } from "@/lib/types";

const PHASES: { key: QAPhase; label: string; description: string; icon: typeof Globe }[] = [
  { key: "init", label: "Init", description: "Opening browser", icon: Globe },
  { key: "discovery", label: "Discover", description: "Finding pages", icon: Search },
  { key: "planning", label: "Plan", description: "Creating tests", icon: FileText },
  { key: "execution", label: "Execute", description: "Running tests", icon: Play },
  { key: "traversal", label: "Traverse", description: "Testing pages", icon: Compass },
  { key: "evaluation", label: "Evaluate", description: "Scoring results", icon: BarChart3 },
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
          {PHASES.map((phase) => {
            const state = phases[phase.key];
            const isActive = state.status === "active";
            const isComplete = state.status === "completed";
            const Icon = phase.icon;

            return (
              <div key={phase.key} className="flex flex-col items-center flex-1">
                {/* Node */}
                <div
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 border-2 relative",
                    isComplete &&
                      "bg-foreground text-background border-foreground shadow-sm",
                    isActive &&
                      "bg-background border-foreground shadow-md",
                    !isComplete &&
                      !isActive &&
                      "bg-muted border-muted text-muted-foreground"
                  )}
                >
                  {isComplete ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Icon className={cn(
                      "w-5 h-5",
                      isActive && "animate-pulse"
                    )} />
                  )}
                  {/* Active indicator ring */}
                  {isActive && (
                    <div className="absolute -inset-1 rounded-xl border-2 border-foreground/30 animate-ping opacity-50" />
                  )}
                </div>

                {/* Label */}
                <div className="mt-3 text-center">
                  <span
                    className={cn(
                      "text-sm font-medium block transition-colors",
                      isActive && "text-foreground",
                      isComplete && "text-foreground",
                      !isActive && !isComplete && "text-muted-foreground"
                    )}
                  >
                    {phase.label}
                  </span>
                  <span className={cn(
                    "text-xs transition-colors",
                    isActive ? "text-foreground/70" : "text-muted-foreground"
                  )}>
                    {phase.description}
                  </span>
                </div>

                {/* Step progress for execution or traversal phase */}
                {(phase.key === "execution" || phase.key === "traversal") && isActive && totalSteps > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <Progress
                      value={(currentStep / totalSteps) * 100}
                      className="w-16 h-1.5"
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
