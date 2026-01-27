import React from "react";
import { Box, Text } from "ink";

export function Header(): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">
          UI QA Agent
        </Text>
      </Box>
      <Text dimColor>AI-powered website testing</Text>
    </Box>
  );
}
