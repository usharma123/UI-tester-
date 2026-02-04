import React from "react";
import { Box, Text } from "ink";
import type { ScenarioProgress } from "../types.js";
import { TaskItem } from "./TaskItem.js";

interface ScenarioListProps {
  scenarios: ScenarioProgress[];
  maxHeight: number;
}

export function ScenarioList({ scenarios, maxHeight }: ScenarioListProps): React.ReactElement {
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

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text bold>Scenarios </Text>
        <Text dimColor>
          ({passed} passed, {failed} failed, {running} running, {total} total)
        </Text>
      </Box>

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
            label={s.title}
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
