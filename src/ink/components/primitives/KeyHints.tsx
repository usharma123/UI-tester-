import React from "react";
import { Box, Text } from "ink";

interface KeyHint {
  key: string;
  label: string;
}

interface KeyHintsProps {
  hints: KeyHint[];
}

export function KeyHints({ hints }: KeyHintsProps): React.ReactElement {
  return (
    <Box>
      {hints.map((hint, index) => (
        <Box key={`${hint.key}-${hint.label}`} marginRight={index < hints.length - 1 ? 2 : 0}>
          <Text color="yellow">{hint.key}</Text>
          <Text color="gray"> {hint.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
