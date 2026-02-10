import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface PhaseStep {
  id: string;
  label: string;
}

interface PhaseRailProps {
  steps: PhaseStep[];
  currentStep: string | null;
  completedSteps: string[];
  variant?: "numeric" | "flow";
}

export function PhaseRail({
  steps,
  currentStep,
  completedSteps,
  variant = "flow",
}: PhaseRailProps): React.ReactElement {
  const currentLabel = steps.find((step) => step.id === currentStep)?.label ?? currentStep;

  return (
    <Box flexDirection="column">
      <Box height={1}>
        {currentStep ? (
          <>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text> {currentLabel}</Text>
          </>
        ) : (
          <Text color="gray">Waiting…</Text>
        )}
      </Box>

      <Box>
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep;
          const isPending = !isCompleted && !isCurrent;
          const badge = isCompleted ? "[x]" : isCurrent ? "[>]" : "[ ]";
          const badgeColor = isCompleted ? "green" : isCurrent ? "cyan" : "gray";

          if (variant === "numeric") {
            return (
              <Box key={step.id} marginRight={1}>
                <Text color={badgeColor}>{badge}</Text>
                <Text color={isPending ? "gray" : "white"}> {index + 1}</Text>
              </Box>
            );
          }

          return (
            <Box key={step.id} marginRight={index < steps.length - 1 ? 1 : 0}>
              <Text color={badgeColor}>{badge}</Text>
              <Text color={isPending ? "gray" : "white"}> {step.label}</Text>
              {index < steps.length - 1 && <Text color="gray"> ></Text>}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
