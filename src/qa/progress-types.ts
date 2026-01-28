import type { Plan, Report, Evidence, Step, ExecutedStepStatus } from "./types.js";
import type {
  Requirement,
  Rubric,
  RequirementResult,
  TraceabilityReport,
  ValidationPhase,
} from "../validation/types.js";

// Phases of the QA run
export type QAPhase = "init" | "discovery" | "planning" | "execution" | "traversal" | "evaluation";

// Sitemap URL structure
export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  priority?: number;
}

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

// Sitemap discovered
export interface SitemapEvent extends SSEEventBase {
  type: "sitemap";
  urls: SitemapUrl[];
  source: "sitemap.xml" | "robots.txt" | "crawled" | "none";
  totalPages: number;
}

// Page traversal events (for systematic page testing)
export interface PageStartEvent extends SSEEventBase {
  type: "page_start";
  url: string;
  pageIndex: number;
  totalPages: number;
}

export type PageStatus = "success" | "skipped" | "failed";

export interface PageCompleteEvent extends SSEEventBase {
  type: "page_complete";
  url: string;
  pageIndex: number;
  status: PageStatus;
  screenshotUrl?: string;
  stepsExecuted?: number;
  error?: string;
}

// Progress tracking for pages
export interface PagesProgressEvent extends SSEEventBase {
  type: "pages_progress";
  tested: number;
  skipped: number;
  remaining: number;
  total: number;
}

// ===========================================
// Validation-specific events
// ===========================================

// Validation phase lifecycle
export interface ValidationPhaseStartEvent extends SSEEventBase {
  type: "validation_phase_start";
  phase: ValidationPhase;
}

export interface ValidationPhaseCompleteEvent extends SSEEventBase {
  type: "validation_phase_complete";
  phase: ValidationPhase;
}

// Requirements extracted from spec
export interface RequirementsExtractedEvent extends SSEEventBase {
  type: "requirements_extracted";
  requirements: Requirement[];
  totalCount: number;
}

// Rubric generated
export interface RubricGeneratedEvent extends SSEEventBase {
  type: "rubric_generated";
  rubric: Rubric;
}

// Single requirement validated
export interface RequirementValidatedEvent extends SSEEventBase {
  type: "requirement_validated";
  result: RequirementResult;
  index: number;
  total: number;
}

// Validation complete
export interface ValidationCompleteEvent extends SSEEventBase {
  type: "validation_complete";
  report: TraceabilityReport;
}

// Validation error
export interface ValidationErrorEvent extends SSEEventBase {
  type: "validation_error";
  message: string;
  phase?: ValidationPhase;
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
  | LogEvent
  | SitemapEvent
  | PageStartEvent
  | PageCompleteEvent
  | PagesProgressEvent
  // Validation events
  | ValidationPhaseStartEvent
  | ValidationPhaseCompleteEvent
  | RequirementsExtractedEvent
  | RubricGeneratedEvent
  | RequirementValidatedEvent
  | ValidationCompleteEvent
  | ValidationErrorEvent;

// Progress callback type for streaming runner
export type ProgressCallback = (event: SSEEvent) => void;
