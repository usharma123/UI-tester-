import type { Config, BudgetConfig } from "../config.js";
import type { ValidationConfig } from "./types.js";

export const DEFAULT_VALIDATION_BUDGET_CONFIG: BudgetConfig = {
  maxStepsPerPageState: 10,
  maxUniqueStates: 100,
  maxTotalSteps: 500,
  stagnationThreshold: 15,
  maxDepth: 10,
  maxTimeMs: 600000,
};

export function buildValidationQaConfig(
  config: ValidationConfig,
  screenshotDir: string,
  goals: string
): Config {
  return {
    openRouterApiKey: config.openRouterApiKey,
    openRouterModel: config.openRouterModel,
    maxSteps: 20,
    goals,
    screenshotDir,
    reportDir: config.outputDir,
    browserTimeout: config.browserTimeout,
    navigationTimeout: config.navigationTimeout,
    actionTimeout: config.actionTimeout,
    maxRetries: 3,
    retryDelayMs: 1000,
    maxPages: config.maxPages,
    stepsPerPage: config.stepsPerPage,
    parallelBrowsers: config.parallelBrowsers,
    auditsEnabled: false,
    strictMode: false,
    captureBeforeAfterScreenshots: true,
    viewports: [{ label: "desktop", width: 1365, height: 768 }],
    budgetConfig: DEFAULT_VALIDATION_BUDGET_CONFIG,
    explorationMode: "coverage_guided",
    beamWidth: 3,
    coverageGuidedEnabled: false,
    visualAuditsEnabled: false,
    baselineDir: ".ui-qa/baselines",
    diffThreshold: 5,
    authFixtureDir: ".ui-qa/auth-fixtures",
    llmNavigatorConfig: {
      enabled: false,
      model: config.openRouterModel,
      temperature: 0.3,
      maxLLMCallsPerStep: 2,
      smartInteractions: true,
      maxRetries: 2,
      timeoutMs: 30000,
      enableHeuristicFirst: true,
      heuristicConfidenceThreshold: 75,
      maxAITimeout: 10000,
      maxAIRetries: 1,
    },
  };
}
