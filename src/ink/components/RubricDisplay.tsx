/**
 * Component to display generated rubric
 */

import React from "react";
import { Box, Text } from "ink";
import type { Rubric } from "../../validation/types.js";
import { SectionTitle } from "./primitives/SectionTitle.js";
import { truncateText } from "../utils/truncate.js";

interface RubricDisplayProps {
  rubric: Rubric;
  maxHeight?: number;
  maxWidth?: number;
}

export function RubricDisplay({
  rubric,
  maxHeight = 6,
  maxWidth = 100,
}: RubricDisplayProps): React.ReactElement {
  const displayCriteria = rubric.criteria.slice(0, maxHeight);
  const remaining = rubric.criteria.length - displayCriteria.length;
  const avgWeight = rubric.criteria.length > 0
    ? (rubric.criteria.reduce((sum, c) => sum + c.weight, 0) / rubric.criteria.length).toFixed(1)
    : "0";
  const criterionWidth = Math.max(18, maxWidth - 26);

  return (
    <Box flexDirection="column">
      <SectionTitle title="Rubric" summary={`(${rubric.criteria.length} criteria, max ${rubric.maxScore}, avg W ${avgWeight})`} />
      <Box flexDirection="column">
        {displayCriteria.map((criterion) => (
          <Box key={criterion.requirementId} marginLeft={1}>
            <Text color="cyan">{criterion.requirementId}</Text>
            <Text> </Text>
            <Text color="yellow">[W:{criterion.weight}]</Text>
            <Text> </Text>
            <Text>
              {truncateText(criterion.criterion, criterionWidth)}
            </Text>
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
