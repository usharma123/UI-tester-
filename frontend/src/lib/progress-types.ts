/**
 * Progress State Model
 *
 * This module defines a clear hierarchy between phases and tasks:
 * - Phases: High-level stages of the QA pipeline (Init, Discover, Plan, etc.)
 * - Tasks: Low-level activities within a phase (Opening browser, Finding pages, etc.)
 *
 * The model supports:
 * - Iterative workflows (phases can be revisited)
 * - Bounded progress (never exceeds 100%)
 * - Clear status states with accessibility in mind
 */

import type { QAPhase } from "./types";

// Phase status with explicit states
export type PhaseStatus =
  | "pending"      // Not started yet
  | "active"       // Currently running
  | "completed"    // Successfully finished
  | "skipped"      // Intentionally skipped
  | "error";       // Failed with error

// Task status for sub-activities within a phase
export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

// A task is a low-level activity within a phase
export interface Task {
  id: string;
  label: string;
  status: TaskStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  // Progress for tasks that have measurable sub-steps
  progress?: {
    current: number;
    total: number;
  };
}

// Enhanced phase state with tasks and timing
export interface PhaseState {
  status: PhaseStatus;
  startedAt?: number;
  completedAt?: number;
  // Current activity description (shown as status message)
  currentActivity?: string;
  // Tasks within this phase
  tasks: Task[];
  // How many times this phase has been entered (for iterative workflows)
  iterationCount: number;
  // Error message if status is "error"
  error?: string;
}

// Phase metadata for display
export interface PhaseMetadata {
  key: QAPhase;
  label: string;
  description: string;
  // Accessible description for screen readers
  ariaLabel: string;
  // Icon identifier (used to render the correct icon)
  icon: PhaseIcon;
}

// Icon types with clear semantic meaning
export type PhaseIcon =
  | "browser"      // Init - starting browser
  | "search"       // Discovery - finding pages
  | "document"     // Planning - creating test plan
  | "play"         // Execution - running tests
  | "layers"       // Traversal - testing multiple pages
  | "chart";       // Evaluation - analyzing results

// Phase configuration
export const PHASE_CONFIG: PhaseMetadata[] = [
  {
    key: "init",
    label: "Initialize",
    description: "Starting browser",
    ariaLabel: "Initialization phase: Starting the browser and loading the target URL",
    icon: "browser",
  },
  {
    key: "discovery",
    label: "Discover",
    description: "Finding pages",
    ariaLabel: "Discovery phase: Analyzing site structure and finding testable pages",
    icon: "search",
  },
  {
    key: "planning",
    label: "Plan",
    description: "Creating tests",
    ariaLabel: "Planning phase: Generating test scenarios based on discovered pages",
    icon: "document",
  },
  {
    key: "execution",
    label: "Execute",
    description: "Running tests",
    ariaLabel: "Execution phase: Running planned test scenarios",
    icon: "play",
  },
  {
    key: "traversal",
    label: "Traverse",
    description: "Testing pages",
    ariaLabel: "Traversal phase: Systematically testing discovered pages",
    icon: "layers",
  },
  {
    key: "evaluation",
    label: "Evaluate",
    description: "Scoring results",
    ariaLabel: "Evaluation phase: Analyzing test results and generating report",
    icon: "chart",
  },
];

// Helper to get phase metadata
export function getPhaseMetadata(phase: QAPhase): PhaseMetadata {
  return PHASE_CONFIG.find(p => p.key === phase) || PHASE_CONFIG[0];
}

// Helper to calculate bounded progress percentage
export function calculateProgress(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (current / total) * 100));
}

// Helper to format progress as a bounded string (e.g., "3/5")
export function formatProgress(current: number, total: number): string {
  if (total <= 0) return "";
  // Clamp current to never exceed total
  const clampedCurrent = Math.min(current, total);
  return `${clampedCurrent}/${total}`;
}

// Helper to get human-readable status for screen readers
export function getStatusAnnouncement(phase: PhaseMetadata, state: PhaseState): string {
  switch (state.status) {
    case "pending":
      return `${phase.label} phase: Not started`;
    case "active":
      return `${phase.label} phase: In progress${state.currentActivity ? `. ${state.currentActivity}` : ""}`;
    case "completed":
      return `${phase.label} phase: Completed`;
    case "skipped":
      return `${phase.label} phase: Skipped`;
    case "error":
      return `${phase.label} phase: Failed${state.error ? `. Error: ${state.error}` : ""}`;
  }
}

// Initial state for a phase
export function createInitialPhaseState(): PhaseState {
  return {
    status: "pending",
    tasks: [],
    iterationCount: 0,
  };
}

// Create initial phases map
export function createInitialPhases(): Record<QAPhase, PhaseState> {
  return {
    init: createInitialPhaseState(),
    discovery: createInitialPhaseState(),
    planning: createInitialPhaseState(),
    execution: createInitialPhaseState(),
    traversal: createInitialPhaseState(),
    evaluation: createInitialPhaseState(),
  };
}
