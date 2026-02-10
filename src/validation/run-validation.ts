/**
 * Main validation runner - orchestrates the 8-phase validation process
 */

import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ValidationConfig, TraceabilityReport } from "./types.js";
import type { ProgressCallback } from "../qa/progress-types.js";
import { getTimestamp } from "../utils/time.js";
import { ensureDir } from "../utils/fs.js";
import * as localStorage from "../storage/local.js";
import type { TestExecutionSummary } from "./cross-validator.js";
import { runParsingPhase } from "./phases/parsing.js";
import { runExtractionPhase } from "./phases/extraction.js";
import { runRubricPhase } from "./phases/rubric.js";
import { runDiscoveryPhase } from "./phases/discovery.js";
import { runPlanningPhase } from "./phases/planning.js";
import { runExecutionPhase } from "./phases/execution.js";
import { runCrossValidationPhase } from "./phases/cross-validation.js";
import { runReportingPhase } from "./phases/reporting.js";
import { emit } from "../core/events/emit.js";

export interface ValidationRunOptions {
  config: ValidationConfig;
  runId?: string;
  eventsFilePath?: string;
  onProgress: ProgressCallback;
}

export interface ValidationRunResult {
  report: TraceabilityReport;
  reportPath: string;
  markdownPath: string;
}

/**
 * Run the full validation process
 */
export async function runValidation(
  options: ValidationRunOptions
): Promise<ValidationRunResult> {
  const { config, onProgress } = options;
  const timestamp = getTimestamp();
  const runId = options.runId ?? `validation-${Date.now()}`;

  const screenshotDir = join(tmpdir(), `validation-screenshots-${timestamp}`);
  await ensureDir(screenshotDir);
  await ensureDir(config.outputDir);

  await localStorage.createLocalRun(runId, config.url, "validation");
  if (options.eventsFilePath) {
    await localStorage.setLocalRunEventsFile(runId, options.eventsFilePath);
  }

  const testExecution: TestExecutionSummary = {
    pagesVisited: [],
    stepsExecuted: [],
    errors: [],
    screenshots: [],
    scenarioRuns: [],
  };

  let browserToClose: { close: () => Promise<void> } | null = null;

  try {
    const document = await runParsingPhase({
      specFile: config.specFile,
      onProgress,
    });

    const requirements = await runExtractionPhase({
      document,
      openRouterApiKey: config.openRouterApiKey,
      openRouterModel: config.openRouterModel,
      onProgress,
    });

    const rubric = await runRubricPhase({
      requirements,
      openRouterApiKey: config.openRouterApiKey,
      openRouterModel: config.openRouterModel,
      onProgress,
    });

    const { browser, initialSnapshot, sitemap } = await runDiscoveryPhase({
      config,
      onProgress,
      screenshotDir,
      testExecution,
    });
    browserToClose = browser;

    const { scenarios, qaConfig } = await runPlanningPhase({
      config,
      requirements,
      initialSnapshot,
      sitemap,
      screenshotDir,
      browser,
      onProgress,
    });

    await runExecutionPhase({
      config,
      qaConfig,
      scenarios,
      screenshotDir,
      onProgress,
      testExecution,
    });

    const results = await runCrossValidationPhase({
      requirements,
      rubric,
      testExecution,
      openRouterApiKey: config.openRouterApiKey,
      openRouterModel: config.openRouterModel,
      onProgress,
    });

    return await runReportingPhase({
      specFile: config.specFile,
      url: config.url,
      requirements,
      rubric,
      results,
      outputDir: config.outputDir,
      onProgress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(onProgress, {
      type: "validation_error",
      message,
    });
    throw error;
  } finally {
    if (browserToClose) {
      try {
        await browserToClose.close();
      } catch {
        // Ignore browser close errors
      }
    }
  }
}
