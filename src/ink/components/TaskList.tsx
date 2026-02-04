import React from "react";
import { Box, Text } from "ink";
import type { Task } from "../types.js";
import { TaskItem } from "./TaskItem.js";

interface TaskListProps {
  tasks: Task[];
}

export function TaskList({ tasks }: TaskListProps): React.ReactElement {
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
      </Box>
    </Box>
  );
}
