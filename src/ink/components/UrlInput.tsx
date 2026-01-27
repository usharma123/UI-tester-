import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export function UrlInput({ value, onChange, onSubmit }: UrlInputProps): React.ReactElement {
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (url: string): void => {
    // Validate URL
    if (!url.trim()) {
      setError("URL is required");
      return;
    }

    // Add protocol if missing
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
      new URL(normalizedUrl);
      setError(null);
      onSubmit(normalizedUrl);
    } catch {
      setError("Invalid URL format");
    }
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box borderStyle="round" borderColor="blue" flexDirection="column" paddingX={2} paddingY={1}>
        <Text>Enter website URL:</Text>

        <Box marginTop={1}>
          <Text color="cyan">{"> "}</Text>
          <TextInput
            value={value}
            onChange={(newValue) => {
              setError(null);
              onChange(newValue);
            }}
            onSubmit={handleSubmit}
            placeholder="http://localhost:3000"
          />
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[Enter] Start  [Ctrl+C] Exit</Text>
      </Box>
    </Box>
  );
}
