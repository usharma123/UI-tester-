import type { Config } from "../config.js";
import type { ValidationConfig } from "./types.js";

export function buildValidationQaConfig(
  config: ValidationConfig,
  screenshotDir: string,
  goals: string
): Config {
  return {
    openRouterApiKey: config.openRouterApiKey,
    openRouterModel: config.openRouterModel,
    maxPages: config.maxPages,
    maxScenariosPerPage: config.maxScenariosPerPage,
    maxStepsPerScenario: config.maxStepsPerScenario,
    parallelBrowsers: config.parallelBrowsers,
    browserTimeout: config.browserTimeout,
    navigationTimeout: config.navigationTimeout,
    actionTimeout: config.actionTimeout,
    maxRetries: 3,
    retryDelayMs: 1000,
    goals,
    headless: true,
    screenshotDir,
    reportDir: config.outputDir,
  };
}
