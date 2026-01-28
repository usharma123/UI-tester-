import React from "react";
import { Box, Text, useInput } from "ink";
import type { ExplorationMode } from "../types.js";

interface ModeSelectorProps {
  selectedMode: ExplorationMode;
  onModeChange: (mode: ExplorationMode) => void;
  onSubmit: () => void;
}

const modes: { value: ExplorationMode; label: string; description: string }[] = [
  {
    value: "coverage_guided",
    label: "Coverage-Guided Exploration",
    description: "Smart exploration that maximizes coverage using state tracking and beam search",
  },
  {
    value: "parallel",
    label: "Parallel Page Testing",
    description: "Fast systematic testing of discovered pages using multiple browsers",
  },
];

export function ModeSelector({ selectedMode, onModeChange, onSubmit }: ModeSelectorProps): React.ReactElement {
  useInput((input, key) => {
    if (key.upArrow || key.downArrow) {
      const currentIndex = modes.findIndex((m) => m.value === selectedMode);
      const nextIndex = key.upArrow
        ? (currentIndex - 1 + modes.length) % modes.length
        : (currentIndex + 1) % modes.length;
      onModeChange(modes[nextIndex].value);
    }

    if (key.return) {
      onSubmit();
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select Testing Mode:</Text>
      <Box marginTop={1} flexDirection="column">
        {modes.map((mode) => {
          const isSelected = mode.value === selectedMode;
          return (
            <Box key={mode.value} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={isSelected ? "cyan" : "white"}>
                  {isSelected ? "[*]" : "[ ]"} {mode.label}
                </Text>
                {isSelected && <Text color="green"> (selected)</Text>}
              </Box>
              <Box marginLeft={4}>
                <Text dimColor>{mode.description}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Use arrow keys to select, Enter to continue</Text>
      </Box>
    </Box>
  );
}
