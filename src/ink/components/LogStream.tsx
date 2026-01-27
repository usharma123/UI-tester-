import React from "react";
import { Box, Text } from "ink";

interface LogEntry {
  message: string;
  level: "info" | "warn" | "error";
  timestamp: number;
}

interface LogStreamProps {
  logs: LogEntry[];
  maxLines?: number;
  scrollOffset?: number;
}

const levelColors: Record<string, string | undefined> = {
  info: undefined,
  warn: "yellow",
  error: "red",
};

const levelPrefix: Record<string, string> = {
  info: " ",
  warn: "!",
  error: "x",
};

export function LogStream({ logs, maxLines = 6, scrollOffset = 0 }: LogStreamProps): React.ReactElement {
  // Calculate visible window based on scroll offset
  const totalLogs = logs.length;
  const maxOffset = Math.max(0, totalLogs - maxLines);
  const effectiveOffset = Math.min(scrollOffset, maxOffset);
  const startIndex = effectiveOffset;
  const endIndex = Math.min(startIndex + maxLines, totalLogs);
  const visibleLogs = logs.slice(startIndex, endIndex);

  const hasMoreAbove = startIndex > 0;
  const hasMoreBelow = endIndex < totalLogs;

  // Fixed height: header (1) + indicator lines (2 max) + log lines (maxLines)
  const fixedHeight = maxLines + 3;

  return (
    <Box flexDirection="column" marginTop={1} height={fixedHeight} overflowY="hidden">
      <Box>
        <Text dimColor>Logs</Text>
        {totalLogs > 0 && (hasMoreAbove || hasMoreBelow) && (
          <Text dimColor> (↑/↓ to scroll)</Text>
        )}
        {totalLogs === 0 && <Text dimColor> (waiting...)</Text>}
      </Box>
      {hasMoreAbove && (
        <Text dimColor>  ↑ {startIndex} more</Text>
      )}
      {visibleLogs.map((log, index) => (
        <Box key={`${log.timestamp}-${index}`}>
          <Text color={levelColors[log.level]} dimColor>
            [{levelPrefix[log.level]}]
          </Text>
          <Text dimColor> {log.message}</Text>
        </Box>
      ))}
      {/* Fill empty space to maintain fixed height */}
      {Array.from({ length: Math.max(0, maxLines - visibleLogs.length) }).map((_, i) => (
        <Text key={`empty-${i}`}> </Text>
      ))}
      {hasMoreBelow && (
        <Text dimColor>  ↓ {totalLogs - endIndex} more</Text>
      )}
    </Box>
  );
}
