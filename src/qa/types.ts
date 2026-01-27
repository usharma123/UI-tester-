export type StepType = "open" | "snapshot" | "click" | "fill" | "press" | "getText" | "screenshot";

export interface Step {
  type: StepType;
  selector?: string;
  text?: string;
  key?: string;
  path?: string;
  note?: string;
}

export interface Plan {
  url: string;
  steps: Step[];
}

export interface PagePlan {
  steps: Step[];
}

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

export type ExecutedStepStatus = "success" | "failed" | "blocked";

export interface ExecutedStep {
  index: number;
  step: Step;
  status: ExecutedStepStatus;
  result?: string;
  error?: string;
  screenshotPath?: string;
  timestamp: number;
}

export interface SnapshotEntry {
  stepIndex: number;
  content: string;
}

export interface ErrorEntry {
  stepIndex: number;
  error: string;
}

export interface ViewportInfo {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface DomAuditSample {
  selector: string;
  text?: string;
}

export interface DomAuditSummary {
  imagesMissingAlt: number;
  inputsMissingLabel: number;
  buttonsMissingLabel: number;
  linksGenericText: number;
  emptyHeadings: number;
  headingOrderIssues: number;
  h1Count: number;
  smallTouchTargets: number;
  htmlLangMissing: boolean;
  horizontalOverflowPx: number;
}

export interface DomAuditSamples {
  imagesMissingAlt: DomAuditSample[];
  inputsMissingLabel: DomAuditSample[];
  buttonsMissingLabel: DomAuditSample[];
  linksGenericText: DomAuditSample[];
  emptyHeadings: DomAuditSample[];
  headingOrderIssues: DomAuditSample[];
  smallTouchTargets: DomAuditSample[];
}

export interface DomAuditResult {
  pageUrl: string;
  label: string;
  viewport: ViewportInfo;
  summary: DomAuditSummary;
  samples: DomAuditSamples;
  timestamp: number;
}

export interface AuditEntry extends DomAuditResult {
  screenshotPath?: string;
}

export interface Evidence {
  plan: Plan;
  executedSteps: ExecutedStep[];
  snapshots: SnapshotEntry[];
  errors: ErrorEntry[];
  screenshotMap: Record<string, number>;
  audits?: AuditEntry[];
}

export interface RunContext {
  url: string;
  goals: string;
  maxSteps: number;
  timestamp: string;
  screenshotDir: string;
  reportDir: string;
}
