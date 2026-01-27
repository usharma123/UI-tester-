import { useReducer, useCallback } from "react";
import type { Task, TaskStatus } from "../types.js";

interface TaskState {
  tasks: Task[];
}

type TaskAction =
  | { type: "ADD_TASK"; task: Task }
  | { type: "UPDATE_TASK"; id: string; updates: Partial<Task> }
  | { type: "SET_STATUS"; id: string; status: TaskStatus }
  | { type: "ADD_CHILD"; parentId: string; child: Task }
  | { type: "CLEAR" };

function taskReducer(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case "ADD_TASK":
      return {
        ...state,
        tasks: [...state.tasks, action.task],
      };

    case "UPDATE_TASK":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, ...action.updates } : task
        ),
      };

    case "SET_STATUS":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, status: action.status } : task
        ),
      };

    case "ADD_CHILD":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.parentId
            ? {
                ...task,
                children: [...(task.children || []), action.child],
              }
            : task
        ),
      };

    case "CLEAR":
      return { tasks: [] };

    default:
      return state;
  }
}

export function useTaskManager() {
  const [state, dispatch] = useReducer(taskReducer, { tasks: [] });

  const addTask = useCallback((task: Task) => {
    dispatch({ type: "ADD_TASK", task });
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    dispatch({ type: "UPDATE_TASK", id, updates });
  }, []);

  const setStatus = useCallback((id: string, status: TaskStatus) => {
    dispatch({ type: "SET_STATUS", id, status });
  }, []);

  const addChild = useCallback((parentId: string, child: Task) => {
    dispatch({ type: "ADD_CHILD", parentId, child });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  return {
    tasks: state.tasks,
    addTask,
    updateTask,
    setStatus,
    addChild,
    clear,
  };
}
