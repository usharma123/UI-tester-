import { afterEach, describe, expect, it } from "bun:test";
import { loadValidationConfig } from "../../src/validation/config.js";

const ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "MAX_PAGES",
  "MAX_SCENARIOS_PER_PAGE",
  "MAX_STEPS_PER_SCENARIO",
  "PARALLEL_BROWSERS",
  "BROWSER_TIMEOUT",
  "NAVIGATION_TIMEOUT",
  "ACTION_TIMEOUT",
  "VALIDATION_GAP_ROUNDS",
  "VALIDATION_GAP_PAGES_PER_ROUND",
  "VALIDATION_MAX_TOTAL_SCENARIOS",
  "VALIDATION_ENABLE_PROBES",
  "VALIDATION_PERF_LOAD_BUDGET_MS",
  "VALIDATION_PERF_UI_BUDGET_MS",
] as const;

const ORIGINAL_ENV: Record<string, string | undefined> = Object.fromEntries(
  ENV_KEYS.map((k) => [k, process.env[k]])
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

describe("loadValidationConfig", () => {
  it("applies validation defaults", () => {
    for (const key of ENV_KEYS) delete process.env[key];

    const config = loadValidationConfig({
      specFile: "./requirements.md",
      url: "http://localhost:3000",
      outputDir: "./reports",
    });

    expect(config.maxScenariosPerPage).toBe(8);
    expect(config.maxStepsPerScenario).toBe(14);
    expect(config.gapRounds).toBe(4);
    expect(config.gapPagesPerRound).toBe(3);
    expect(config.maxTotalScenarios).toBe(60);
    expect(config.enableProbes).toBe(true);
    expect(config.perfLoadBudgetMs).toBe(2000);
    expect(config.perfUiBudgetMs).toBe(100);
  });

  it("reads validation env overrides", () => {
    process.env.MAX_SCENARIOS_PER_PAGE = "11";
    process.env.MAX_STEPS_PER_SCENARIO = "16";
    process.env.VALIDATION_GAP_ROUNDS = "6";
    process.env.VALIDATION_GAP_PAGES_PER_ROUND = "5";
    process.env.VALIDATION_MAX_TOTAL_SCENARIOS = "90";
    process.env.VALIDATION_ENABLE_PROBES = "false";
    process.env.VALIDATION_PERF_LOAD_BUDGET_MS = "2500";
    process.env.VALIDATION_PERF_UI_BUDGET_MS = "120";

    const config = loadValidationConfig({
      specFile: "./requirements.md",
      url: "http://localhost:3000",
      outputDir: "./reports",
    });

    expect(config.maxScenariosPerPage).toBe(11);
    expect(config.maxStepsPerScenario).toBe(16);
    expect(config.gapRounds).toBe(6);
    expect(config.gapPagesPerRound).toBe(5);
    expect(config.maxTotalScenarios).toBe(90);
    expect(config.enableProbes).toBe(false);
    expect(config.perfLoadBudgetMs).toBe(2500);
    expect(config.perfUiBudgetMs).toBe(120);
  });
});
