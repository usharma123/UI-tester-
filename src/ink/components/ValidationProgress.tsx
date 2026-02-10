/**
 * Component to display validation phase progress
 */

import React from "react";
import type { ValidationPhase } from "../../validation/types.js";
import { validationPhaseLabels } from "../validate-types.js";
import { PhaseRail } from "./primitives/PhaseRail.js";

interface ValidationProgressProps {
  currentPhase: ValidationPhase | null;
  completedPhases: ValidationPhase[];
}

const allPhases: ValidationPhase[] = [
  "parsing",
  "extraction",
  "rubric",
  "discovery",
  "planning",
  "execution",
  "cross_validation",
  "reporting",
];

export function ValidationProgress({
  currentPhase,
  completedPhases,
}: ValidationProgressProps): React.ReactElement {
  const steps = allPhases.map((phase) => ({
    id: phase,
    label: validationPhaseLabels[phase],
  }));

  return (
    <PhaseRail
      steps={steps}
      currentStep={currentPhase}
      completedSteps={completedPhases}
      variant="numeric"
    />
  );
}
