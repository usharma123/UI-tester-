import type { ProgressCallback } from "../../qa/progress-types.js";
import type { Requirement } from "../types.js";
import type { Config } from "../../config.js";
import type { Plan } from "../../qa/types.js";
import type { SitemapResult } from "../../utils/sitemap.js";
import { emit, emitValidationPhaseStart, emitValidationPhaseComplete } from "../../core/events/emit.js";
import { formatSitemapForPlanner } from "../../utils/sitemap.js";
import { createPlan } from "../../qa/planner.js";
import { buildValidationQaConfig } from "../qa-config.js";
import type { ValidationConfig } from "../types.js";

export interface PlanningPhaseOptions {
  config: ValidationConfig;
  requirements: Requirement[];
  initialSnapshot: string;
  sitemap: SitemapResult;
  screenshotDir: string;
  onProgress: ProgressCallback;
}

export interface PlanningPhaseResult {
  plan: Plan;
  requirementGoals: string;
  qaConfig: Config;
}

export async function runPlanningPhase(options: PlanningPhaseOptions): Promise<PlanningPhaseResult> {
  const { config, requirements, initialSnapshot, sitemap, screenshotDir, onProgress } = options;

  emitValidationPhaseStart(onProgress, "planning");
  emit(onProgress, {
    type: "log",
    message: "Generating requirement-linked test plan...",
    level: "info",
  });

  const requirementGoals = requirements
    .filter((r) => r.testable && r.priority !== "wont")
    .map((r) => `${r.id}: ${r.summary}`)
    .join("; ");

  const sitemapContext = formatSitemapForPlanner(sitemap);
  const sitemapUrls = sitemap.urls.map((u) => u.loc);

  const qaConfig = buildValidationQaConfig(config, screenshotDir, requirementGoals);

  const { plan } = await createPlan(
    qaConfig,
    config.url,
    requirementGoals,
    initialSnapshot,
    sitemapContext,
    sitemapUrls
  );

  emit(onProgress, {
    type: "plan_created",
    plan,
    totalSteps: plan.steps.length,
  });

  emitValidationPhaseComplete(onProgress, "planning");

  return { plan, requirementGoals, qaConfig };
}
