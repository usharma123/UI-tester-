import type { Plan, Report, Evidence, Step, ExecutedStepStatus } from "../qa/types";

// Phases of the QA run
export type QAPhase = "init" | "planning" | "execution" | "evaluation";

// Base SSE event structure
export interface SSEEventBase {
  type: string;
  timestamp: number;
}

// Connection established
export interface ConnectedEvent extends SSEEventBase {
  type: "connected";
  runId: string;
}

// Phase lifecycle events
export interface PhaseStartEvent extends SSEEventBase {
  type: "phase_start";
  phase: QAPhase;
}

export interface PhaseCompleteEvent extends SSEEventBase {
  type: "phase_complete";
  phase: QAPhase;
}

// Screenshot captured
export interface ScreenshotEvent extends SSEEventBase {
  type: "screenshot";
  url: string;
  stepIndex: number;
  label: string;
}

// Plan created
export interface PlanCreatedEvent extends SSEEventBase {
  type: "plan_created";
  plan: Plan;
  totalSteps: number;
}

// Step execution events
export interface StepStartEvent extends SSEEventBase {
  type: "step_start";
  stepIndex: number;
  step: Step;
  totalSteps: number;
}

export interface StepCompleteEvent extends SSEEventBase {
  type: "step_complete";
  stepIndex: number;
  status: ExecutedStepStatus;
  result?: string;
  error?: string;
  screenshotUrl?: string;
}

// Run completed successfully
export interface CompleteEvent extends SSEEventBase {
  type: "complete";
  report: Report;
  evidence: Evidence;
}

// Run failed with error
export interface ErrorEvent extends SSEEventBase {
  type: "error";
  message: string;
  phase?: QAPhase;
}

// Log message for debugging
export interface LogEvent extends SSEEventBase {
  type: "log";
  message: string;
  level: "info" | "warn" | "error";
}

// Union of all SSE event types
export type SSEEvent =
  | ConnectedEvent
  | PhaseStartEvent
  | PhaseCompleteEvent
  | ScreenshotEvent
  | PlanCreatedEvent
  | StepStartEvent
  | StepCompleteEvent
  | CompleteEvent
  | ErrorEvent
  | LogEvent;

// Progress callback type for streaming runner
export type ProgressCallback = (event: SSEEvent) => void;

// API request/response types
export interface StartRunRequest {
  url: string;
  goals?: string;
}

export interface StartRunResponse {
  runId: string;
  status: "started";
}

export interface RunStatus {
  runId: string;
  url: string;
  goals: string;
  status: "running" | "completed" | "failed";
  score?: number;
  summary?: string;
  startedAt: number;
  completedAt?: number;
}

export interface RunListResponse {
  runs: RunStatus[];
}
