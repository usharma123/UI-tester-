/**
 * Component to display extracted requirements
 */

import React from "react";
import { Box, Text } from "ink";
import type { Requirement } from "../../validation/types.js";
import { SectionTitle } from "./primitives/SectionTitle.js";
import { truncateText } from "../utils/truncate.js";

interface RequirementListProps {
  requirements: Requirement[];
  maxHeight?: number;
  maxWidth?: number;
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
  maxWidth = 100,
}: RequirementListProps): React.ReactElement {
  const displayRequirements = requirements.slice(0, maxHeight);
  const remaining = requirements.length - displayRequirements.length;
  const mustCount = requirements.filter((r) => r.priority === "must").length;
  const shouldCount = requirements.filter((r) => r.priority === "should").length;
  const testableCount = requirements.filter((r) => r.testable).length;
  const summaryWidth = Math.max(18, maxWidth - 32);

  return (
    <Box flexDirection="column">
      <SectionTitle
        title="Requirements"
        summary={`(${requirements.length}: ${mustCount} MUST, ${shouldCount} SHOULD, ${testableCount} testable)`}
      />
      <Box flexDirection="column">
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
            <Text>{truncateText(req.summary, summaryWidth)}</Text>
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
