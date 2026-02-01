import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ExplorationMode } from "../types.js";

interface ModeSelectorProps {
  selectedMode: ExplorationMode;
  onModeChange: (mode: ExplorationMode) => void;
  onSubmit: () => void;
}

type BaseMode = "coverage_guided" | "parallel";

const baseModes: { value: BaseMode; label: string; description: string }[] = [
  {
    value: "coverage_guided",
    label: "Coverage-Guided Exploration",
    description: "Smart exploration that maximizes coverage using state tracking",
  },
  {
    value: "parallel",
    label: "Parallel Page Testing",
    description: "Fast systematic testing of discovered pages using multiple browsers",
  },
];

export function ModeSelector({ selectedMode, onModeChange, onSubmit }: ModeSelectorProps): React.ReactElement {
  // Track which row is focused: 0-1 for base modes, 2 for LLM toggle
  const [focusedRow, setFocusedRow] = useState(0);

  // LLM toggle state
  const [llmEnabled, setLlmEnabled] = useState(selectedMode === "llm_guided");

  // Base mode (used when LLM is disabled)
  const [baseMode, setBaseMode] = useState<BaseMode>(
    selectedMode === "llm_guided" ? "coverage_guided" : (selectedMode as BaseMode)
  );

  useInput((input, key) => {
    // Navigate with arrow keys
    if (key.upArrow) {
      setFocusedRow((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setFocusedRow((prev) => Math.min(2, prev + 1));
    }

    // Space or Enter to select/toggle
    if (input === " " || key.return) {
      if (focusedRow < 2) {
        // Selecting a base mode
        const newBaseMode = baseModes[focusedRow].value;
        setBaseMode(newBaseMode);
        if (!llmEnabled) {
          onModeChange(newBaseMode);
        }
        // If Enter, also submit
        if (key.return) {
          onSubmit();
        }
      } else if (focusedRow === 2) {
        // Toggling LLM mode
        const newLlmEnabled = !llmEnabled;
        setLlmEnabled(newLlmEnabled);
        onModeChange(newLlmEnabled ? "llm_guided" : baseMode);
        // Don't submit on toggle, let user press Enter again
      }
    }

    // 'l' key to quickly toggle LLM mode
    if (input === "l" || input === "L") {
      const newLlmEnabled = !llmEnabled;
      setLlmEnabled(newLlmEnabled);
      onModeChange(newLlmEnabled ? "llm_guided" : baseMode);
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select Testing Mode:</Text>
      <Box marginTop={1} flexDirection="column">
        {baseModes.map((mode, index) => {
          const isSelected = baseMode === mode.value;
          const isFocused = focusedRow === index;
          return (
            <Box key={mode.value} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={isFocused ? "cyan" : "white"} bold={isFocused}>
                  {isFocused ? ">" : " "} {isSelected ? "(●)" : "( )"} {mode.label}
                </Text>
              </Box>
              <Box marginLeft={4}>
                <Text dimColor>{mode.description}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* LLM Toggle */}
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color={focusedRow === 2 ? "cyan" : "white"} bold={focusedRow === 2}>
            {focusedRow === 2 ? ">" : " "} [{llmEnabled ? "✓" : " "}] Enable LLM-Guided Navigation
          </Text>
          {llmEnabled && <Text color="yellow"> (experimental)</Text>}
        </Box>
        <Box marginLeft={4}>
          <Text dimColor>AI decides which actions to take, generates smart search queries</Text>
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          ↑↓ navigate • Space select • L toggle LLM • Enter start
        </Text>
      </Box>
    </Box>
  );
}
