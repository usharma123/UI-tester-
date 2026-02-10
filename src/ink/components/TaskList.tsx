import React from "react";
import { Box, Text } from "ink";
import type { Task } from "../types.js";
import { TaskItem } from "./TaskItem.js";

interface TaskListProps {
  tasks: Task[];
  maxHeight?: number;
}

export function TaskList({ tasks, maxHeight = 8 }: TaskListProps): React.ReactElement {
  const completed = tasks.filter((task) => task.status === "success").length;
  const running = tasks.filter((task) => task.status === "running").length;
  const failed = tasks.filter((task) => task.status === "failed").length;

  // Reserve 2 lines for header + potential overflow indicator
  const availableLines = Math.max(1, maxHeight - 2);
  const visibleTasks = tasks.slice(0, availableLines);
  const hiddenCount = tasks.length - visibleTasks.length;

  return (
    <Box flexDirection="column">
      <Text bold>Tasks <Text color="gray">({completed} done, {running} running, {failed} failed)</Text></Text>

      <Box borderStyle="single" borderColor="gray" borderTop={false} borderRight={false} borderBottom={false} paddingLeft={1} flexDirection="column">
        {visibleTasks.map((task) => (
          <TaskItem
            key={task.id}
            label={task.label}
            status={task.status}
            detail={task.detail}
          />
        ))}
        {hiddenCount > 0 && <Text color="gray">  ... and {hiddenCount} more</Text>}
      </Box>
    </Box>
  );
}
