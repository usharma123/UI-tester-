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

  // Broad pass across discovered pages
  for (let i = 0; i < pageUrls.length; i++) {
    if (allScenarios.length >= config.maxTotalScenarios) break;
    const pageUrl = pageUrls[i];
    emit(onProgress, {
      type: "log",
      message: `Analyzing page ${i + 1}/${pageUrls.length}: ${pageUrl}`,
      level: "info",
    });

    const remainingBudget = Math.max(config.maxTotalScenarios - allScenarios.length, 0);
    const perPageBudget = Math.min(qaConfig.maxScenariosPerPage, remainingBudget);
    if (perPageBudget <= 0) break;

    try {
      const scenarios = await analyzePage({
        browser,
        url: pageUrl,
        llm,
        screenshotDir,
        maxScenarios: perPageBudget,
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

  mergeAndAnnotateScenarios(allScenarios, requirements);

  // Iterative must/should coverage closure
  for (let round = 1; round <= config.gapRounds; round++) {
    if (allScenarios.length >= config.maxTotalScenarios) {
      emit(onProgress, {
        type: "log",
        message: `Stopping gap analysis: scenario cap reached (${config.maxTotalScenarios})`,
        level: "warn",
      });
      break;
    }

    const uncovered = findUncoveredMustShould(requirements, allScenarios);
    if (uncovered.length === 0) {
      emit(onProgress, {
        type: "log",
        message: `Coverage closure complete: all must/should requirements mapped to scenarios.`,
        level: "info",
      });
      break;
    }

    const targetPageUrls = rankPagesForRequirements(pageUrls, uncovered).slice(0, config.gapPagesPerRound);
    const uncoveredGoals = uncovered.map((r) => `${r.id}: ${r.summary}`).join("; ");
    emit(onProgress, {
      type: "log",
      message: `Gap round ${round}/${config.gapRounds}: ${uncovered.length} uncovered must/should requirements, targeting ${targetPageUrls.length} page(s).`,
      level: "info",
    });

    const beforeCount = allScenarios.length;
    for (const targetUrl of targetPageUrls) {
      if (allScenarios.length >= config.maxTotalScenarios) break;
      const remainingBudget = Math.max(config.maxTotalScenarios - allScenarios.length, 0);
      const perPageBudget = Math.min(
        qaConfig.maxScenariosPerPage,
        Math.max(2, Math.min(uncovered.length, qaConfig.maxScenariosPerPage)),
        remainingBudget
      );
      if (perPageBudget <= 0) break;

      try {
        const gapScenarios = await analyzePage({
          browser,
          url: targetUrl,
          llm,
          screenshotDir,
          maxScenarios: perPageBudget,
          goals: `FOCUS ONLY on these uncovered requirements and capture explicit evidence: ${uncoveredGoals}`,
        });
        allScenarios.push(...gapScenarios);
      } catch (err) {
        emit(onProgress, {
          type: "log",
          message: `Gap round ${round} failed on ${targetUrl}: ${err instanceof Error ? err.message : String(err)}`,
          level: "warn",
        });
      }
    }

    mergeAndAnnotateScenarios(allScenarios, requirements);
    const roundAdded = allScenarios.length - beforeCount;
    const uncoveredAfter = findUncoveredMustShould(requirements, allScenarios).length;
    emit(onProgress, {
      type: "log",
      message: `Gap round ${round} added ${roundAdded} scenario(s). Uncovered must/should remaining: ${uncoveredAfter}.`,
      level: "info",
    });
  }

  emit(onProgress, {
    type: "log",
    message: `Generated ${allScenarios.length} test scenarios from ${pageUrls.length} pages`,
    level: "info",
  });

  emitValidationPhaseComplete(onProgress, "planning");

  return { scenarios: allScenarios, requirementGoals, qaConfig };
}

function findUncoveredMustShould(requirements: Requirement[], scenarios: TestScenario[]): Requirement[] {
  const coveredReqIds = new Set(scenarios.flatMap((s) => s.requirementIds ?? []));
  return requirements.filter(
    (r) =>
      r.testable &&
      (r.priority === "must" || r.priority === "should") &&
      !coveredReqIds.has(r.id)
  );
}

function rankPagesForRequirements(pageUrls: string[], requirements: Requirement[]): string[] {
  const keywords = extractRequirementKeywords(requirements);
  const scored = pageUrls.map((url, index) => {
    const lowerUrl = url.toLowerCase();
    let score = 0;
    for (const keyword of keywords) {
      if (lowerUrl.includes(keyword)) score += 1;
    }
    if (index === 0) score += 0.1; // slight homepage tie-breaker
    return { url, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.url);
}

function extractRequirementKeywords(requirements: Requirement[]): string[] {
  const keywords = new Set<string>();
  for (const req of requirements) {
    const text = `${req.summary} ${req.acceptanceCriteria.join(" ")}`.toLowerCase();
    const tokens = text.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
    for (const token of tokens) {
      if (!["with", "that", "from", "have", "must", "should", "when", "then"].includes(token)) {
        keywords.add(token);
      }
    }
  }
  return Array.from(keywords).slice(0, 200);
}

function mergeAndAnnotateScenarios(scenarios: TestScenario[], requirements: Requirement[]): void {
  for (const scenario of scenarios) {
    if (!scenario.requirementIds || scenario.requirementIds.length === 0) {
      const inferred = inferScenarioRequirementIds(scenario, requirements);
      if (inferred.length > 0) scenario.requirementIds = inferred;
    }
  }

  const deduplicated = dedupeScenarios(scenarios);
  scenarios.length = 0;
  scenarios.push(...deduplicated);
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

export const __planningInternals = {
  findUncoveredMustShould,
  rankPagesForRequirements,
  mergeAndAnnotateScenarios,
  inferScenarioRequirementIds,
  dedupeScenarios,
};
