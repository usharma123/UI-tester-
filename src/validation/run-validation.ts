/**
 * Main validation runner - orchestrates the 8-phase validation process
 */

import { basename, join } from "node:path";
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

function resolveCloseTimeoutMs(): number {
  const parsed = parseInt(process.env.BROWSER_CLOSE_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 5000;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function persistValidationScreenshots(
  runId: string,
  testExecution: TestExecutionSummary,
  onProgress: ProgressCallback
): Promise<void> {
  const allPaths = new Set<string>();

  for (const path of testExecution.screenshots) {
    if (path) allPaths.add(path);
  }
  for (const step of testExecution.stepsExecuted) {
    if (step.screenshot) allPaths.add(step.screenshot);
  }
  for (const probe of testExecution.probeResults) {
    for (const path of probe.evidence) {
      if (path) allPaths.add(path);
    }
  }

  const localPathMap = new Map<string, string>();
  let screenshotIndex = 0;

  for (const sourcePath of allPaths) {
    try {
      const { localPath } = await localStorage.saveLocalScreenshot(
        runId,
        sourcePath,
        screenshotIndex,
        basename(sourcePath) || "validation"
      );
      localPathMap.set(sourcePath, localPath);
      screenshotIndex += 1;
    } catch (err) {
      emit(onProgress, {
        type: "log",
        message: `Failed to persist screenshot ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`,
        level: "warn",
      });
    }
  }

  if (localPathMap.size === 0) {
    return;
  }

  testExecution.screenshots = testExecution.screenshots.map(
    (path) => localPathMap.get(path) ?? path
  );

  for (const step of testExecution.stepsExecuted) {
    if (step.screenshot) {
      step.screenshot = localPathMap.get(step.screenshot) ?? step.screenshot;
    }
  }

  for (const probe of testExecution.probeResults) {
    probe.evidence = probe.evidence.map((path) => localPathMap.get(path) ?? path);
  }

  emit(onProgress, {
    type: "log",
    message: `Persisted ${localPathMap.size} validation screenshot(s) to local run storage`,
    level: "info",
  });
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
    probeResults: [],
  };

  let browserToClose: { close: () => Promise<void> } | null = null;
  const closeTimeoutMs = resolveCloseTimeoutMs();

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
    await persistValidationScreenshots(runId, testExecution, onProgress);

    const results = await runCrossValidationPhase({
      requirements,
      rubric,
      testExecution,
      openRouterApiKey: config.openRouterApiKey,
      openRouterModel: config.openRouterModel,
      onProgress,
    });

    const reportResult = await runReportingPhase({
      specFile: config.specFile,
      url: config.url,
      requirements,
      rubric,
      results,
      probeResults: testExecution.probeResults,
      outputDir: config.outputDir,
      onProgress,
    });
    await localStorage.completeLocalValidationRun(
      runId,
      reportResult.report,
      reportResult.reportPath,
      reportResult.markdownPath
    );
    return reportResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(onProgress, {
      type: "validation_error",
      message,
    });
    try {
      await localStorage.failLocalRun(runId, message);
    } catch {
      // Ignore local run persistence errors
    }
    throw error;
  } finally {
    if (browserToClose) {
      try {
        await withTimeout(browserToClose.close(), closeTimeoutMs, "Validation discovery browser close");
      } catch (err) {
        emit(onProgress, {
          type: "log",
          message: `Discovery browser close failed: ${err instanceof Error ? err.message : String(err)}`,
          level: "warn",
        });
      }
    }
  }
}
