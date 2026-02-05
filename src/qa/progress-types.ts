import type { Report, Evidence, TestStatus } from "./types.js";
import type {
  Requirement,
  Rubric,
  RequirementResult,
  TraceabilityReport,
  ValidationPhase,
} from "../validation/types.js";

// Phases of the QA run
export type QAPhase = "discovery" | "analysis" | "execution" | "evaluation";

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

// Scenario events
export interface ScenarioStartEvent extends SSEEventBase {
  type: "scenario_start";
  scenarioId: string;
  title: string;
  index: number;
  total: number;
}

export interface ScenarioCompleteEvent extends SSEEventBase {
  type: "scenario_complete";
  scenarioId: string;
  status: TestStatus;
  index: number;
  total: number;
}

// Scenario info for todo list
export interface ScenarioInfo {
  id: string;
  title: string;
}

// Scenarios generated after analysis
export interface ScenariosGeneratedEvent extends SSEEventBase {
  type: "scenarios_generated";
  totalScenarios: number;
  totalPages: number;
  scenarios: ScenarioInfo[];
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

// ===========================================
// Validation-specific events
// ===========================================

export interface ValidationPhaseStartEvent extends SSEEventBase {
  type: "validation_phase_start";
  phase: ValidationPhase;
}

export interface ValidationPhaseCompleteEvent extends SSEEventBase {
  type: "validation_phase_complete";
  phase: ValidationPhase;
}

export interface RequirementsExtractedEvent extends SSEEventBase {
  type: "requirements_extracted";
  requirements: Requirement[];
  totalCount: number;
}

export interface RubricGeneratedEvent extends SSEEventBase {
  type: "rubric_generated";
  rubric: Rubric;
}

export interface RequirementValidatedEvent extends SSEEventBase {
  type: "requirement_validated";
  result: RequirementResult;
  index: number;
  total: number;
}

export interface ValidationCompleteEvent extends SSEEventBase {
  type: "validation_complete";
  report: TraceabilityReport;
  reportPath: string;
  markdownPath: string;
}

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
  | ScenarioStartEvent
  | ScenarioCompleteEvent
  | ScenariosGeneratedEvent
  | CompleteEvent
  | ErrorEvent
  | LogEvent
  | SitemapEvent
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
