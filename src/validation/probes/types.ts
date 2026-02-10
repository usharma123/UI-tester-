import type { AgentBrowser } from "../../agentBrowser.js";
import type { ValidationConfig } from "../types.js";
import type { ProgressCallback } from "../../qa/progress-types.js";

export type ValidationProbeKind =
  | "keyboard"
  | "responsive"
  | "performance"
  | "accessibility";

export type ValidationProbeStatus = "pass" | "partial" | "fail" | "error";

export interface ValidationProbeResult {
  id: string;
  kind: ValidationProbeKind;
  status: ValidationProbeStatus;
  summary: string;
  evidence: string[];
  coveredRequirementIds: string[];
  metrics?: Record<string, number>;
  findings?: string[];
}

export interface ValidationProbeContext {
  browser: AgentBrowser;
  url: string;
  screenshotDir: string;
  config: ValidationConfig;
  onProgress: ProgressCallback;
}
