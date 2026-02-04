// =============================================================================
// Core QA Types — Agent-based testing pipeline
// =============================================================================

export interface TestScenario {
  id: string;
  title: string;
  description: string;
  startUrl: string;
  priority: "critical" | "high" | "medium" | "low";
  category: "forms" | "navigation" | "auth" | "content" | "interaction" | "e2e";
  maxSteps: number;
  /** "global" scenarios are site-wide features tested once; "page" scenarios are page-specific */
  scope: "global" | "page";
}

export type AgentActionType =
  | "click"
  | "fill"
  | "press"
  | "hover"
  | "scroll"
  | "navigate"
  | "wait"
  | "assert"
  | "done";

export interface AgentAction {
  type: AgentActionType;
  selector?: string;
  value?: string;
  reasoning: string;
  result?: "pass" | "fail";
}

export interface AgentStep {
  index: number;
  action: AgentAction;
  success: boolean;
  error?: string;
  screenshotPath?: string;
  timestamp: number;
}

export type TestStatus = "pass" | "fail" | "error" | "skip";

export interface TestResult {
  scenario: TestScenario;
  status: TestStatus;
  steps: AgentStep[];
  summary: string;
  evidence: { screenshots: string[] };
  durationMs: number;
}

// Issue types for the final report (kept for backward compat with storage/report generation)
export type IssueSeverity = "blocker" | "high" | "medium" | "low" | "nit";

export type IssueCategory = "Navigation" | "Forms" | "Accessibility" | "Visual" | "Feedback" | "Content";

export interface Issue {
  severity: IssueSeverity;
  title: string;
  category: IssueCategory;
  reproSteps: string[];
  expected: string;
  actual: string;
  evidence: string[];
  suggestedFix: string;
}

export interface Report {
  url: string;
  testedFlows: string[];
  score: number;
  summary: string;
  issues: Issue[];
  artifacts: {
    screenshots: string[];
    evidenceFile: string;
    reportFile?: string;
    llmFixFile?: string;
  };
}

export interface QAReport {
  url: string;
  timestamp: string;
  scenarios: TestResult[];
  summary: string;
  overallScore: number;
  issueCount: { critical: number; high: number; medium: number; low: number };
}

// Evidence type for evaluation / local storage
export interface Evidence {
  scenarios: TestResult[];
  screenshotMap: Record<string, string>;
}

