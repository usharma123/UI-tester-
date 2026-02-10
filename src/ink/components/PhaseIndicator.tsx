import React from "react";
import type { QAPhase } from "../../qa/progress-types.js";
import { PhaseRail } from "./primitives/PhaseRail.js";

interface PhaseIndicatorProps {
  currentPhase: QAPhase | null;
  completedPhases: QAPhase[];
}

const phaseOrder: QAPhase[] = ["discovery", "analysis", "execution", "evaluation"];

const phaseLabels: Record<QAPhase, string> = {
  discovery: "Discovering",
  analysis: "Analyzing",
  execution: "Executing",
  evaluation: "Evaluating",
};

export function PhaseIndicator({
  currentPhase,
  completedPhases,
}: PhaseIndicatorProps): React.ReactElement {
  const steps = phaseOrder.map((phase) => ({
    id: phase,
    label: phaseLabels[phase],
  }));

  return (
    <PhaseRail
      steps={steps}
      currentStep={currentPhase}
      completedSteps={completedPhases}
      variant="flow"
    />
  );
}
