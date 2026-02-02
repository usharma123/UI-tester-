import type { Config } from "../../config.js";
import type { ProgressCallback } from "../progress-types.js";
import type { Plan } from "../types.js";
import type { SitemapResult } from "../../utils/sitemap.js";
import { emit, emitPhaseStart, emitPhaseComplete } from "../../core/events/emit.js";
import { formatSitemapForPlanner } from "../../utils/sitemap.js";
import { createPlan } from "../planner.js";

export interface PlanningPhaseResult {
  plan: Plan;
  sitemapContext: string;
  sitemapUrls: string[];
}

export interface PlanningPhaseOptions {
  config: Config;
  url: string;
  goals: string;
  initialSnapshot: string;
  sitemap: SitemapResult;
  onProgress: ProgressCallback;
}

export async function runPlanningPhase(options: PlanningPhaseOptions): Promise<PlanningPhaseResult> {
  const { config, url, goals, initialSnapshot, sitemap, onProgress } = options;

  emitPhaseStart(onProgress, "planning");
  emit(onProgress, { type: "log", message: `Creating test plan for: ${goals}`, level: "info" });

  const sitemapContext = formatSitemapForPlanner(sitemap);
  const sitemapUrls = sitemap.urls.map((u) => u.loc);

  const { plan } = await createPlan(config, url, goals, initialSnapshot, sitemapContext, sitemapUrls);

  emit(onProgress, {
    type: "plan_created",
    plan,
    totalSteps: plan.steps.length,
  });

  emitPhaseComplete(onProgress, "planning");

  return { plan, sitemapContext, sitemapUrls };
}
