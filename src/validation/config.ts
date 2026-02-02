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
    stepsPerPage: parseInt(process.env.STEPS_PER_PAGE || "5", 10),
    parallelBrowsers: parseInt(process.env.PARALLEL_BROWSERS || "5", 10),
    browserTimeout: parseInt(process.env.BROWSER_TIMEOUT || "60000", 10),
    navigationTimeout: parseInt(process.env.NAVIGATION_TIMEOUT || "45000", 10),
    actionTimeout: parseInt(process.env.ACTION_TIMEOUT || "15000", 10),
  };
}
