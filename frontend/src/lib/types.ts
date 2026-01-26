// Types ported from src/web/types.ts

export type QAPhase = "init" | "discovery" | "planning" | "execution" | "traversal" | "evaluation";

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  priority?: number;
}

export interface Step {
  type: string;
  note?: string;
  selector?: string;
  value?: string;
}

export type ExecutedStepStatus = "success" | "failed" | "blocked";

export interface Issue {
  title: string;
  severity: "blocker" | "high" | "medium" | "low" | "nit";
  category: string;
  reproSteps: string[];
  expected: string;
  actual: string;
  suggestedFix: string;
  evidence?: string[];
}

export interface Report {
  score: number;
  summary: string;
  testedFlows: string[];
  issues: Issue[];
  url?: string;
}

export interface Evidence {
  screenshots: string[];
}

export interface Screenshot {
  url: string;
  label: string;
  stepIndex: number;
}

// SSE Event types
export interface SSEEventBase {
  type: string;
  timestamp: number;
}

export interface ConnectedEvent extends SSEEventBase {
  type: "connected";
  runId: string;
}

export interface PhaseStartEvent extends SSEEventBase {
  type: "phase_start";
  phase: QAPhase;
}

export interface PhaseCompleteEvent extends SSEEventBase {
  type: "phase_complete";
  phase: QAPhase;
}

export interface ScreenshotEvent extends SSEEventBase {
  type: "screenshot";
  url: string;
  stepIndex: number;
  label: string;
}

export interface PlanCreatedEvent extends SSEEventBase {
  type: "plan_created";
  totalSteps: number;
}

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

export interface CompleteEvent extends SSEEventBase {
  type: "complete";
  report: Report;
  evidence: Evidence;
}

export interface ErrorEvent extends SSEEventBase {
  type: "error";
  message: string;
  phase?: QAPhase;
}

export interface LogEvent extends SSEEventBase {
  type: "log";
  message: string;
  level: "info" | "warn" | "error";
}

export interface SitemapEvent extends SSEEventBase {
  type: "sitemap";
  urls: SitemapUrl[];
  source: "sitemap.xml" | "robots.txt" | "crawled" | "none";
  totalPages: number;
}

// Page-level progress events for traversal phase
export interface PageStartEvent extends SSEEventBase {
  type: "page_start";
  url: string;
  pageIndex: number;
  totalPages: number;
}

export interface PageCompleteEvent extends SSEEventBase {
  type: "page_complete";
  url: string;
  pageIndex: number;
  status: "success" | "skipped" | "failed";
  screenshotUrl?: string;
  stepsExecuted?: number;
  error?: string;
}

export interface PagesProgressEvent extends SSEEventBase {
  type: "pages_progress";
  tested: number;
  skipped: number;
  remaining: number;
  total: number;
}

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
  | PagesProgressEvent;

// API types
export interface StartRunRequest {
  url: string;
  goals?: string;
}

export interface StartRunResponse {
  runId: string;
  status: "started";
}

export interface RunStatus {
  _id: string;
  url: string;
  goals: string;
  status: "running" | "completed" | "failed";
  score?: number;
  summary?: string;
  startedAt: number;
  completedAt?: number;
  report?: Report;
  screenshots?: Screenshot[];
  error?: string;
}

export interface LogEntry {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  timestamp: Date;
}
