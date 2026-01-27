import React from "react";
import { Box, Text } from "ink";
import type { Task, PageProgress } from "../types.js";
import { TaskItem } from "./TaskItem.js";

interface TaskListProps {
  tasks: Task[];
  pages?: PageProgress[];
}

// Get path from URL
function getUrlPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return url;
  }
}

export function TaskList({ tasks, pages = [] }: TaskListProps): React.ReactElement {
  // Filter to show only a subset of pages
  const maxVisiblePages = 5;
  const runningPages = pages.filter((p) => p.status === "running");
  const recentPages = pages.filter((p) => p.status !== "running").slice(-3);

  const visiblePages = [...runningPages, ...recentPages].slice(0, maxVisiblePages);

  // Check if there are more pages
  const hasMorePages = pages.length > visiblePages.length;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text bold>Tasks</Text>
      </Box>

      <Box borderStyle="single" borderColor="gray" borderTop={false} borderRight={false} borderBottom={false} paddingLeft={1} flexDirection="column">
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            label={task.label}
            status={task.status}
            detail={task.detail}
          />
        ))}

        {visiblePages.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {visiblePages.map((page, index) => {
              const isLast = index === visiblePages.length - 1 && !hasMorePages;
              const prefix = isLast ? "└─ " : "├─ ";
              return (
                <TaskItem
                  key={`page-${page.pageIndex}`}
                  label={getUrlPath(page.url)}
                  status={page.status}
                  detail={page.stepsExecuted ? `${page.stepsExecuted} steps` : undefined}
                  prefix={prefix}
                />
              );
            })}
            {hasMorePages && (
              <Box paddingLeft={0}>
                <Text dimColor>└─ ... and {pages.length - visiblePages.length} more</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
