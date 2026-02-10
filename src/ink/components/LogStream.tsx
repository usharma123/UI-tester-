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
  autoFollow?: boolean;
}

const levelColors: Record<string, string | undefined> = {
  info: "gray",
  warn: "yellow",
  error: "red",
};

const levelPrefix: Record<string, string> = {
  info: "i",
  warn: "!",
  error: "x",
};

export function LogStream({
  logs,
  maxLines = 6,
  scrollOffset = 0,
  autoFollow = true,
}: LogStreamProps): React.ReactElement {
  const totalLogs = logs.length;
  const maxOffset = Math.max(0, totalLogs - maxLines);
  const effectiveOffset = Math.min(scrollOffset, maxOffset);
  const startIndex = effectiveOffset;
  const endIndex = Math.min(startIndex + maxLines, totalLogs);
  const visibleLogs = logs.slice(startIndex, endIndex);

  const hasMoreAbove = startIndex > 0;
  const hasMoreBelow = endIndex < totalLogs;

  const bodyLines: Array<{
    kind: "log" | "meta";
    text: string;
    color?: string;
  }> = [];

  if (hasMoreAbove) {
    bodyLines.push({ kind: "meta", text: `  ↑ ${startIndex} more`, color: "gray" });
  }

  for (const log of visibleLogs) {
    bodyLines.push({
      kind: "log",
      text: `[${levelPrefix[log.level]}] ${log.message}`,
      color: levelColors[log.level],
    });
  }

  if (hasMoreBelow) {
    bodyLines.push({ kind: "meta", text: `  ↓ ${totalLogs - endIndex} more`, color: "gray" });
  }

  const visibleBody = bodyLines.slice(0, maxLines);
  const missingLines = Math.max(0, maxLines - visibleBody.length);

  return (
    <Box flexDirection="column">
      <Box>
        <Text>Logs</Text>
        {totalLogs > 0 && (hasMoreAbove || hasMoreBelow) && (
          <Text color="gray"> (↑/↓, j/k, PgUp/PgDn)</Text>
        )}
        {totalLogs === 0 && <Text color="gray"> (waiting...)</Text>}
      </Box>
      <Text color="gray">
        showing {totalLogs === 0 ? 0 : startIndex + 1}-{endIndex} of {totalLogs} | follow {autoFollow ? "on" : "off"}
      </Text>
      {visibleBody.map((line, index) => (
        <Text key={`${line.kind}-${index}`} color={line.color}>
          {line.text}
        </Text>
      ))}
      {Array.from({ length: missingLines }).map((_, i) => (
        <Text key={`empty-${i}`}> </Text>
      ))}
    </Box>
  );
}
