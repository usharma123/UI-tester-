/**
 * Component to display validation phase progress
 */

import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { ValidationPhase } from "../../validation/types.js";
import { validationPhaseLabels } from "../validate-types.js";

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
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        {currentPhase && (
          <>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text> {validationPhaseLabels[currentPhase]}</Text>
          </>
        )}
      </Box>
      <Box>
        {allPhases.map((phase, index) => {
          const isCompleted = completedPhases.includes(phase);
          const isCurrent = phase === currentPhase;
          const isPending = !isCompleted && !isCurrent;

          return (
            <Box key={phase} marginRight={1}>
              <Text
                color={isCompleted ? "green" : isCurrent ? "cyan" : "gray"}
                dimColor={isPending}
              >
                {isCompleted ? "[x]" : isCurrent ? "[>]" : "[ ]"}
              </Text>
              <Text dimColor={isPending}>
                {" "}
                {index + 1}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
