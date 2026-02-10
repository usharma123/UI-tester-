import React from "react";
import { Box, Text } from "ink";
import type { ScenarioProgress } from "../types.js";
import { TaskItem } from "./TaskItem.js";
import { SectionTitle } from "./primitives/SectionTitle.js";
import { truncateText } from "../utils/truncate.js";

interface ScenarioListProps {
  scenarios: ScenarioProgress[];
  maxHeight: number;
  maxWidth?: number;
}

export function ScenarioList({
  scenarios,
  maxHeight,
  maxWidth = 100,
}: ScenarioListProps): React.ReactElement {
  const passed = scenarios.filter((s) => s.status === "success").length;
  const failed = scenarios.filter((s) => s.status === "failed").length;
  const running = scenarios.filter((s) => s.status === "running").length;
  const total = scenarios.length;

  // Reserve 2 lines for header + potential overflow indicator
  const availableLines = Math.max(1, maxHeight - 2);
  const needsTruncation = scenarios.length > availableLines;
  const visibleScenarios = needsTruncation
    ? scenarios.slice(0, availableLines)
    : scenarios;
  const hiddenCount = scenarios.length - visibleScenarios.length;
  const titleWidth = Math.max(20, maxWidth - 12);

  return (
    <Box flexDirection="column">
      <SectionTitle
        title="Scenarios"
        summary={`(${passed} passed, ${failed} failed, ${running} running, ${total} total)`}
      />

      <Box
        borderStyle="single"
        borderColor="gray"
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        paddingLeft={1}
        flexDirection="column"
      >
        {visibleScenarios.map((s) => (
          <TaskItem
            key={s.scenarioId}
            label={truncateText(s.title, titleWidth)}
            status={s.status}
          />
        ))}
        {needsTruncation && (
          <Text dimColor>  … and {hiddenCount} more</Text>
        )}
      </Box>
    </Box>
  );
}
