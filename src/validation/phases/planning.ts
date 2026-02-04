import type { ProgressCallback } from "../../qa/progress-types.js";
import type { Requirement } from "../types.js";
import type { Config } from "../../config.js";
import type { TestScenario } from "../../qa/types.js";
import type { SitemapResult } from "../../utils/sitemap.js";
import type { AgentBrowser } from "../../agentBrowser.js";
import { emit, emitValidationPhaseStart, emitValidationPhaseComplete } from "../../core/events/emit.js";
import { createLLMClient } from "../../qa/llm.js";
import { analyzePage } from "../../qa/analyzer.js";
import { buildValidationQaConfig } from "../qa-config.js";
import type { ValidationConfig } from "../types.js";

export interface PlanningPhaseOptions {
  config: ValidationConfig;
  requirements: Requirement[];
  initialSnapshot: string;
  sitemap: SitemapResult;
  screenshotDir: string;
  browser: AgentBrowser;
  onProgress: ProgressCallback;
}

export interface PlanningPhaseResult {
  scenarios: TestScenario[];
  requirementGoals: string;
  qaConfig: Config;
}

export async function runPlanningPhase(options: PlanningPhaseOptions): Promise<PlanningPhaseResult> {
  const { config, requirements, sitemap, screenshotDir, browser, onProgress } = options;

  emitValidationPhaseStart(onProgress, "planning");
  emit(onProgress, {
    type: "log",
    message: "Generating requirement-linked test scenarios...",
    level: "info",
  });

  const requirementGoals = requirements
    .filter((r) => r.testable && r.priority !== "wont")
    .map((r) => `${r.id}: ${r.summary}`)
    .join("; ");

  const qaConfig = buildValidationQaConfig(config, screenshotDir, requirementGoals);
  const llm = createLLMClient(qaConfig);

  const pageUrls = sitemap.urls.slice(0, config.maxPages).map((u) => u.loc);
  const allScenarios: TestScenario[] = [];

  for (let i = 0; i < pageUrls.length; i++) {
    const pageUrl = pageUrls[i];
    emit(onProgress, {
      type: "log",
      message: `Analyzing page ${i + 1}/${pageUrls.length}: ${pageUrl}`,
      level: "info",
    });

    try {
      const scenarios = await analyzePage({
        browser,
        url: pageUrl,
        llm,
        screenshotDir,
        maxScenarios: qaConfig.maxScenariosPerPage,
        goals: requirementGoals,
      });
      allScenarios.push(...scenarios);
    } catch (err) {
      emit(onProgress, {
        type: "log",
        message: `Failed to analyze ${pageUrl}: ${err instanceof Error ? err.message : String(err)}`,
        level: "warn",
      });
    }
  }

  emit(onProgress, {
    type: "log",
    message: `Generated ${allScenarios.length} test scenarios from ${pageUrls.length} pages`,
    level: "info",
  });

  emitValidationPhaseComplete(onProgress, "planning");

  return { scenarios: allScenarios, requirementGoals, qaConfig };
}
