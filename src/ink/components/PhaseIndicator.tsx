import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { QAPhase } from "../../qa/progress-types.js";

interface PhaseIndicatorProps {
  currentPhase: QAPhase | null;
  completedPhases: QAPhase[];
}

// Phase order
const phaseOrder: QAPhase[] = ["init", "discovery", "planning", "traversal", "execution", "evaluation"];

// Phase labels
const phaseLabels: Record<QAPhase, string> = {
  init: "Initializing",
  discovery: "Discovering",
  planning: "Planning",
  traversal: "Testing",
  execution: "Executing",
  evaluation: "Evaluating",
};

export function PhaseIndicator({
  currentPhase,
  completedPhases,
}: PhaseIndicatorProps): React.ReactElement {
  return (
    <Box>
      {phaseOrder.map((phase, index) => {
        const isCompleted = completedPhases.includes(phase);
        const isCurrent = phase === currentPhase;
        const isPending = !isCompleted && !isCurrent;

        return (
          <Box key={phase} marginRight={index < phaseOrder.length - 1 ? 1 : 0}>
            {isCompleted && <Text color="green">{"[x]"}</Text>}
            {isCurrent && (
              <Box>
                <Text color="cyan">{"["}</Text>
                <Text color="cyan">
                  <Spinner type="dots" />
                </Text>
                <Text color="cyan">{"]"}</Text>
              </Box>
            )}
            {isPending && <Text dimColor>{"[ ]"}</Text>}
            <Text color={isPending ? "gray" : undefined}>
              {" "}
              {phaseLabels[phase]}
            </Text>
            {index < phaseOrder.length - 1 && <Text dimColor> {">"}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
