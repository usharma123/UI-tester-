/**
 * Types for business logic validation feature
 */

/**
 * A requirement extracted from a specification document
 */
export interface Requirement {
  /** Unique identifier (e.g., REQ-001) */
  id: string;
  /** Location in source document */
  sourceLocation: {
    file: string;
    line?: number;
    section?: string;
  };
  /** Original text from the document */
  rawText: string;
  /** LLM-generated summary */
  summary: string;
  /** Requirement category */
  category: RequirementCategory;
  /** Priority using MoSCoW method */
  priority: RequirementPriority;
  /** Whether this requirement can be tested automatically */
  testable: boolean;
  /** Specific acceptance criteria */
  acceptanceCriteria: string[];
}

export type RequirementCategory =
  | "functional"
  | "ui"
  | "accessibility"
  | "performance"
  | "security";

export type RequirementPriority = "must" | "should" | "could" | "wont";

/**
 * A rubric criterion for evaluating a requirement
 */
export interface RubricCriterion {
  /** Links to a requirement */
  requirementId: string;
  /** What is being evaluated */
  criterion: string;
  /** Importance weight (1-10) */
  weight: number;
  /** Condition that indicates pass */
  passCondition: string;
  /** Condition that indicates fail */
  failCondition: string;
}

/**
 * Complete rubric for evaluating all requirements
 */
export interface Rubric {
  /** All criteria for evaluation */
  criteria: RubricCriterion[];
  /** Total possible score */
  maxScore: number;
}

/**
 * Result of testing a single requirement
 */
export interface RequirementResult {
  /** Links to a requirement */
  requirementId: string;
  /** Test outcome */
  status: RequirementStatus;
  /** Score from 0-100 */
  score: number;
  /** Screenshot paths as evidence */
  evidence: string[];
  /** LLM explanation of the result */
  reasoning: string;
}

export type RequirementStatus = "pass" | "partial" | "fail" | "not_tested";

/**
 * Complete traceability report linking spec to test results
 */
export interface TraceabilityReport {
  /** Path to the specification file */
  specFile: string;
  /** URL that was tested */
  url: string;
  /** All extracted requirements */
  requirements: Requirement[];
  /** Generated rubric */
  rubric: Rubric;
  /** Test results for each requirement */
  results: RequirementResult[];
  /** Optional deterministic probe results */
  probeResults?: Array<{
    id: string;
    kind: string;
    status: string;
    summary: string;
    evidence: string[];
    coveredRequirementIds: string[];
    metrics?: Record<string, number>;
    findings?: string[];
  }>;
  /** Overall score (0-100) */
  overallScore: number;
  /** Percentage of requirements tested */
  coverageScore: number;
  /** Summary of the validation */
  summary: string;
  /** Optional probe execution summary */
  probeSummary?: {
    total: number;
    passed: number;
    failed: number;
  };
  /** Timestamp of the validation */
  timestamp: number;
}

/**
 * Validation phase identifiers
 */
export type ValidationPhase =
  | "parsing"
  | "extraction"
  | "rubric"
  | "discovery"
  | "planning"
  | "execution"
  | "cross_validation"
  | "reporting";

/**
 * Configuration for a validation run
 */
export interface ValidationConfig {
  /** Path to the specification file */
  specFile: string;
  /** URL to test */
  url: string;
  /** Output directory for reports */
  outputDir: string;
  /** OpenRouter API key */
  openRouterApiKey: string;
  /** Model to use for LLM calls */
  openRouterModel: string;
  /** Maximum pages to test */
  maxPages: number;
  /** Maximum scenarios generated per page during planning */
  maxScenariosPerPage: number;
  /** Maximum agent steps per scenario */
  maxStepsPerScenario: number;
  /** Number of parallel browsers */
  parallelBrowsers: number;
  /** Browser timeout in ms */
  browserTimeout: number;
  /** Navigation timeout in ms */
  navigationTimeout: number;
  /** Action timeout in ms */
  actionTimeout: number;
  /** Iterative uncovered-requirement planning rounds */
  gapRounds: number;
  /** Max pages to focus per uncovered-requirement round */
  gapPagesPerRound: number;
  /** Hard cap on total scenarios in a validation run */
  maxTotalScenarios: number;
  /** Whether deterministic probes should run after scenario execution */
  enableProbes: boolean;
  /** Load-time budget used by performance probe (ms) */
  perfLoadBudgetMs: number;
  /** UI response budget used by performance probe (ms) */
  perfUiBudgetMs: number;
}

/**
 * State during validation execution
 */
export interface ValidationState {
  /** Current phase */
  currentPhase: ValidationPhase | null;
  /** Completed phases */
  completedPhases: ValidationPhase[];
  /** Parsed requirements */
  requirements: Requirement[];
  /** Generated rubric */
  rubric: Rubric | null;
  /** Test results */
  results: RequirementResult[];
  /** Final report */
  report: TraceabilityReport | null;
  /** Error if any */
  error: string | null;
}

/**
 * Initial validation state
 */
export const initialValidationState: ValidationState = {
  currentPhase: null,
  completedPhases: [],
  requirements: [],
  rubric: null,
  results: [],
  report: null,
  error: null,
};
