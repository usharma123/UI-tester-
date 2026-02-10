/**
 * Types for validation mode UI
 */

import type {
  Requirement,
  Rubric,
  RequirementResult,
  TraceabilityReport,
  ValidationPhase,
} from "../validation/types.js";
import type { SitemapUrl } from "../qa/progress-types.js";

// App mode for validation
export type ValidateAppMode = "input" | "running" | "complete" | "error";

// Phase labels for display
export const validationPhaseLabels: Record<ValidationPhase, string> = {
  parsing: "Parsing specification",
  extraction: "Extracting requirements",
  rubric: "Generating rubric",
  discovery: "Discovering site structure",
  planning: "Creating test plan",
  execution: "Executing tests",
  cross_validation: "Cross-validating results",
  reporting: "Generating report",
};

// Validation app state
export interface ValidateAppState {
  mode: ValidateAppMode;
  specFile: string;
  url: string;

  // Phase tracking
  currentPhase: ValidationPhase | null;
  completedPhases: ValidationPhase[];

  // Requirements
  requirements: Requirement[];

  // Rubric
  rubric: Rubric | null;

  // Sitemap
  sitemap: SitemapUrl[];

  // Test progress
  pagesProgress: {
    tested: number;
    skipped: number;
    remaining: number;
    total: number;
  };

  // Validation results
  results: RequirementResult[];
  validatedCount: number;

  // Logs
  logs: Array<{
    message: string;
    level: "info" | "warn" | "error";
    timestamp: number;
  }>;
  logScrollOffset: number;
  autoFollowLogs: boolean;
  logViewLines: number;

  // Final report
  report: TraceabilityReport | null;
  reportPath: string | null;
  markdownPath: string | null;

  // Error state
  error: string | null;
}

// Initial state
export const initialValidateState: ValidateAppState = {
  mode: "input",
  specFile: "",
  url: "",
  currentPhase: null,
  completedPhases: [],
  requirements: [],
  rubric: null,
  sitemap: [],
  pagesProgress: {
    tested: 0,
    skipped: 0,
    remaining: 0,
    total: 0,
  },
  results: [],
  validatedCount: 0,
  logs: [],
  logScrollOffset: 0,
  autoFollowLogs: true,
  logViewLines: 6,
  report: null,
  reportPath: null,
  markdownPath: null,
  error: null,
};

// Action types
export type ValidateAppAction =
  | { type: "SET_MODE"; mode: ValidateAppMode }
  | { type: "SET_SPEC_FILE"; specFile: string }
  | { type: "SET_URL"; url: string }
  | { type: "SET_LOG_VIEW_LINES"; lines: number }
  | { type: "START_RUN" }
  | { type: "PROCESS_VALIDATION_PHASE_START"; phase: ValidationPhase }
  | { type: "PROCESS_VALIDATION_PHASE_COMPLETE"; phase: ValidationPhase }
  | { type: "SET_REQUIREMENTS"; requirements: Requirement[] }
  | { type: "SET_RUBRIC"; rubric: Rubric }
  | { type: "SET_SITEMAP"; sitemap: SitemapUrl[] }
  | { type: "UPDATE_PAGES_PROGRESS"; progress: ValidateAppState["pagesProgress"] }
  | { type: "ADD_RESULT"; result: RequirementResult; index: number; total: number }
  | { type: "SET_REPORT"; report: TraceabilityReport; reportPath: string; markdownPath: string }
  | { type: "ADD_LOG"; message: string; level: "info" | "warn" | "error" }
  | { type: "SET_ERROR"; error: string }
  | { type: "SCROLL_LOGS"; delta: number }
  | { type: "JUMP_LOGS"; position: "start" | "end" }
  | { type: "RESET" };
