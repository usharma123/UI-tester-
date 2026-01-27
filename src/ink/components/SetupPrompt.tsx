import React from "react";
import { Box, Text } from "ink";

export function SetupPrompt(): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color="yellow">
          API key not found!
        </Text>

        <Box marginTop={1}>
          <Text>
            To use UI QA Agent, you need an OpenRouter API key.
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text>
            Get one at:{" "}
            <Text color="cyan" underline>
              https://openrouter.ai
            </Text>
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text>Create a .env file in your project:</Text>
          <Box
            marginTop={1}
            borderStyle="single"
            borderColor="gray"
            paddingX={2}
            paddingY={0}
          >
            <Text color="green">OPENROUTER_API_KEY=sk-or-v1-xxx...</Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Or set the environment variable directly.</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[Enter] Retry  [q] Exit</Text>
      </Box>
    </Box>
  );
}
