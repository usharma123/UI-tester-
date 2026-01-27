import React from "react";
import { Box, Text } from "ink";

interface ProgressBarProps {
  value: number;
  total: number;
  label?: string;
  width?: number;
}

export function ProgressBar({
  value,
  total,
  label,
  width = 30,
}: ProgressBarProps): React.ReactElement {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  const filledWidth = total > 0 ? Math.round((value / total) * width) : 0;
  const emptyWidth = width - filledWidth;

  const filledBar = "█".repeat(filledWidth);
  const emptyBar = "░".repeat(emptyWidth);

  return (
    <Box>
      {label && (
        <Box marginRight={1} width={10}>
          <Text>{label}:</Text>
        </Box>
      )}
      <Text color="cyan">{filledBar}</Text>
      <Text dimColor>{emptyBar}</Text>
      <Text> {value}/{total}</Text>
      <Text dimColor> ({percentage}%)</Text>
    </Box>
  );
}
