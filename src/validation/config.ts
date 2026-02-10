import type { ValidationConfig } from "./types.js";

export interface ValidationConfigOptions {
  specFile: string;
  url: string;
  outputDir: string;
}

export function loadValidationConfig(options: ValidationConfigOptions): ValidationConfig {
  return {
    specFile: options.specFile,
    url: options.url,
    outputDir: options.outputDir,
    openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
    openRouterModel: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
    maxPages: parseInt(process.env.MAX_PAGES || "50", 10),
    maxScenariosPerPage: parseInt(process.env.MAX_SCENARIOS_PER_PAGE || "8", 10),
    maxStepsPerScenario: parseInt(process.env.MAX_STEPS_PER_SCENARIO || "14", 10),
    parallelBrowsers: parseInt(process.env.PARALLEL_BROWSERS || "5", 10),
    browserTimeout: parseInt(process.env.BROWSER_TIMEOUT || "60000", 10),
    navigationTimeout: parseInt(process.env.NAVIGATION_TIMEOUT || "45000", 10),
    actionTimeout: parseInt(process.env.ACTION_TIMEOUT || "15000", 10),
    gapRounds: parseInt(process.env.VALIDATION_GAP_ROUNDS || "4", 10),
    gapPagesPerRound: parseInt(process.env.VALIDATION_GAP_PAGES_PER_ROUND || "3", 10),
    maxTotalScenarios: parseInt(process.env.VALIDATION_MAX_TOTAL_SCENARIOS || "60", 10),
    enableProbes: (process.env.VALIDATION_ENABLE_PROBES || "true").toLowerCase() !== "false",
    perfLoadBudgetMs: parseInt(process.env.VALIDATION_PERF_LOAD_BUDGET_MS || "2000", 10),
    perfUiBudgetMs: parseInt(process.env.VALIDATION_PERF_UI_BUDGET_MS || "100", 10),
  };
}
