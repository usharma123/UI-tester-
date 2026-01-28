/**
 * Component to display generated rubric
 */

import React from "react";
import { Box, Text } from "ink";
import type { Rubric } from "../../validation/types.js";

interface RubricDisplayProps {
  rubric: Rubric;
  maxHeight?: number;
}

export function RubricDisplay({
  rubric,
  maxHeight = 6,
}: RubricDisplayProps): React.ReactElement {
  const displayCriteria = rubric.criteria.slice(0, maxHeight);
  const remaining = rubric.criteria.length - displayCriteria.length;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        Rubric ({rubric.criteria.length} criteria, max score: {rubric.maxScore})
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {displayCriteria.map((criterion) => (
          <Box key={criterion.requirementId} marginLeft={1}>
            <Text color="cyan">{criterion.requirementId}</Text>
            <Text> </Text>
            <Text color="yellow">[W:{criterion.weight}]</Text>
            <Text> </Text>
            <Text>
              {criterion.criterion.length > 50
                ? criterion.criterion.slice(0, 50) + "..."
                : criterion.criterion}
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
