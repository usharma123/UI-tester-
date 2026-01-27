import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { TaskStatus } from "../types.js";

interface TaskItemProps {
  label: string;
  status: TaskStatus;
  detail?: string;
  indent?: number;
  prefix?: string;
}

// Status icons
const statusIcons: Record<TaskStatus, string> = {
  pending: "○",
  running: "◐",
  success: "✓",
  failed: "✗",
  skipped: "−",
};

// Status colors
const statusColors: Record<TaskStatus, string | undefined> = {
  pending: "gray",
  running: "cyan",
  success: "green",
  failed: "red",
  skipped: "yellow",
};

export function TaskItem({
  label,
  status,
  detail,
  indent = 0,
  prefix,
}: TaskItemProps): React.ReactElement {
  const icon = statusIcons[status];
  const color = statusColors[status];

  return (
    <Box paddingLeft={indent * 2}>
      {prefix && <Text dimColor>{prefix}</Text>}
      <Box marginRight={1}>
        {status === "running" ? (
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
        ) : (
          <Text color={color}>{icon}</Text>
        )}
      </Box>
      <Text color={status === "pending" ? "gray" : undefined}>{label}</Text>
      {detail && (
        <Text dimColor> ({detail})</Text>
      )}
    </Box>
  );
}
