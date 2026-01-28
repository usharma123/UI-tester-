/**
 * Component to display extracted requirements
 */

import React from "react";
import { Box, Text } from "ink";
import type { Requirement } from "../../validation/types.js";

interface RequirementListProps {
  requirements: Requirement[];
  maxHeight?: number;
}

function getPriorityColor(priority: Requirement["priority"]): string {
  switch (priority) {
    case "must":
      return "red";
    case "should":
      return "yellow";
    case "could":
      return "cyan";
    case "wont":
      return "gray";
  }
}

function getCategoryLabel(category: Requirement["category"]): string {
  switch (category) {
    case "functional":
      return "FN";
    case "ui":
      return "UI";
    case "accessibility":
      return "A11Y";
    case "performance":
      return "PERF";
    case "security":
      return "SEC";
  }
}

export function RequirementList({
  requirements,
  maxHeight = 10,
}: RequirementListProps): React.ReactElement {
  const displayRequirements = requirements.slice(0, maxHeight);
  const remaining = requirements.length - displayRequirements.length;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Requirements ({requirements.length} extracted)</Text>
      <Box flexDirection="column" marginTop={1}>
        {displayRequirements.map((req) => (
          <Box key={req.id} marginLeft={1}>
            <Text color="cyan">{req.id}</Text>
            <Text> </Text>
            <Text color={getPriorityColor(req.priority)}>
              [{req.priority.toUpperCase()}]
            </Text>
            <Text> </Text>
            <Text dimColor>[{getCategoryLabel(req.category)}]</Text>
            <Text> </Text>
            <Text>{req.summary}</Text>
            {!req.testable && <Text dimColor> (not testable)</Text>}
          </Box>
        ))}
        {remaining > 0 && (
          <Box marginLeft={1}>
            <Text dimColor>... and {remaining} more</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
