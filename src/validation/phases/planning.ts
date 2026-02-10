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

  // Fill requirementIds when model omitted them using deterministic fallback mapping.
  for (const scenario of allScenarios) {
    if (!scenario.requirementIds || scenario.requirementIds.length === 0) {
      const inferred = inferScenarioRequirementIds(scenario, requirements);
      if (inferred.length > 0) {
        scenario.requirementIds = inferred;
      }
    }
  }

  // Coverage gap detection: find must/should requirements not covered by any scenario
  const coveredReqIds = new Set(
    allScenarios.flatMap((s) => s.requirementIds ?? [])
  );
  const uncoveredRequirements = requirements.filter(
    (r) =>
      r.testable &&
      (r.priority === "must" || r.priority === "should") &&
      !coveredReqIds.has(r.id)
  );

  if (uncoveredRequirements.length > 0 && pageUrls.length > 0) {
    const uncoveredGoals = uncoveredRequirements
      .map((r) => `${r.id}: ${r.summary}`)
      .join("; ");

    emit(onProgress, {
      type: "log",
      message: `${uncoveredRequirements.length} must/should requirements uncovered, running focused second pass...`,
      level: "info",
    });

    // Run a focused second pass on the first page (most likely to have the core features)
    try {
      const gapScenarios = await analyzePage({
        browser,
        url: pageUrls[0],
        llm,
        screenshotDir,
        maxScenarios: Math.min(qaConfig.maxScenariosPerPage, uncoveredRequirements.length),
        goals: `FOCUS on these UNCOVERED requirements: ${uncoveredGoals}`,
      });

      // Tag gap scenarios with matched requirement IDs
      for (const scenario of gapScenarios) {
        const matchedIds = inferScenarioRequirementIds(scenario, uncoveredRequirements);

        if (matchedIds.length > 0) {
          scenario.requirementIds = matchedIds;
        }
      }

      allScenarios.push(...gapScenarios);
      const deduplicated = dedupeScenarios(allScenarios);
      const removedCount = allScenarios.length - deduplicated.length;
      allScenarios.length = 0;
      allScenarios.push(...deduplicated);

      emit(onProgress, {
        type: "log",
        message: `Gap analysis added ${gapScenarios.length} scenarios (${removedCount} duplicates removed)`,
        level: "info",
      });
    } catch (err) {
      emit(onProgress, {
        type: "log",
        message: `Gap analysis failed: ${err instanceof Error ? err.message : String(err)}`,
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

function inferScenarioRequirementIds(
  scenario: Pick<TestScenario, "title" | "description">,
  requirements: Requirement[]
): string[] {
  const text = `${scenario.title} ${scenario.description}`.toLowerCase();
  const matched = new Set<string>();

  // Pass 1: explicit requirement ID mention.
  for (const req of requirements) {
    if (text.includes(req.id.toLowerCase())) {
      matched.add(req.id);
    }
  }
  if (matched.size > 0) {
    return Array.from(matched).slice(0, 5);
  }

  // Pass 2: summary keyword overlap.
  const scored: Array<{ id: string; score: number }> = [];
  for (const req of requirements) {
    const tokens = req.summary
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4);
    if (tokens.length === 0) continue;

    let score = 0;
    for (const token of tokens) {
      if (text.includes(token)) {
        score += 1;
      }
    }
    if (score > 0) {
      scored.push({ id: req.id, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((entry) => entry.score >= 2)
    .slice(0, 3)
    .map((entry) => entry.id);
}

function dedupeScenarios(scenarios: TestScenario[]): TestScenario[] {
  const seen = new Set<string>();
  const result: TestScenario[] = [];

  for (const scenario of scenarios) {
    const key = `${scenario.startUrl}::${normalizeScenarioText(scenario.id)}::${normalizeScenarioText(scenario.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(scenario);
  }
  return result;
}

function normalizeScenarioText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
