import type { ProgressCallback } from "../../qa/progress-types.js";
import type { Step } from "../../qa/types.js";
import { emit, emitValidationPhaseStart, emitValidationPhaseComplete } from "../../core/events/emit.js";
import { createBrowserPool } from "../../utils/browserPool.js";
import { testPagesInParallel, mergeParallelResults } from "../../qa/parallelTester.js";
import type { Config } from "../../config.js";
import type { ValidationConfig } from "../types.js";
import type { SitemapResult } from "../../utils/sitemap.js";
import type { TestExecutionSummary } from "../cross-validator.js";

export interface ExecutionPhaseOptions {
  config: ValidationConfig;
  qaConfig: Config;
  sitemap: SitemapResult;
  screenshotDir: string;
  onProgress: ProgressCallback;
  testExecution: TestExecutionSummary;
  plannedStepCount: number;
}

export async function runExecutionPhase(options: ExecutionPhaseOptions): Promise<void> {
  const { config, qaConfig, sitemap, screenshotDir, onProgress, testExecution, plannedStepCount } = options;

  emitValidationPhaseStart(onProgress, "execution");
  emit(onProgress, {
    type: "log",
    message: `Executing ${plannedStepCount} test steps...`,
    level: "info",
  });

  const pagesToTest = sitemap.urls.slice(0, config.maxPages);

  const browserPool = createBrowserPool(config.parallelBrowsers, {
    timeout: config.browserTimeout,
    navigationTimeout: config.navigationTimeout,
    actionTimeout: config.actionTimeout,
    maxRetries: 3,
    retryDelayMs: 1000,
    debug: process.env.DEBUG === "true",
  });

  try {
    const parallelResults = await testPagesInParallel(
      pagesToTest,
      browserPool,
      qaConfig,
      screenshotDir,
      {
        onPageStart: (url: string, pageIndex: number) => {
          emit(onProgress, {
            type: "page_start",
            url,
            pageIndex,
            totalPages: pagesToTest.length,
          });
          testExecution.pagesVisited.push(url);
        },
        onPageComplete: (result) => {
          emit(onProgress, {
            type: "page_complete",
            url: result.url,
            pageIndex: result.pageIndex,
            status: result.status,
            stepsExecuted: result.stepsExecuted,
            error: result.error,
          });
          if (result.error) {
            testExecution.errors.push(`${result.url}: ${result.error}`);
          }
          for (const step of result.executedSteps) {
            testExecution.stepsExecuted.push({
              type: step.step.type,
              selector: step.step.selector,
              result: step.result || "",
              screenshot: step.screenshotPath,
            });
          }
          testExecution.screenshots.push(...result.screenshotPaths);
        },
        onStepStart: (pageIndex: number, stepIndex: number, step: Step, totalSteps: number) => {
          emit(onProgress, {
            type: "step_start",
            stepIndex,
            step,
            totalSteps,
          });
        },
        onStepComplete: (
          pageIndex: number,
          stepIndex: number,
          status: "success" | "failed" | "blocked",
          result?: string,
          error?: string
        ) => {
          emit(onProgress, {
            type: "step_complete",
            stepIndex,
            status: status === "success" ? "success" : "failed",
            result,
            error,
          });
        },
        onLog: (message: string, level: "info" | "warn" | "error") => {
          emit(onProgress, { type: "log", message, level });
        },
        uploadScreenshot: async (localPath: string, stepIndex: number, label: string) => {
          return localPath;
        },
      }
    );

    const merged = mergeParallelResults(parallelResults);
    emit(onProgress, {
      type: "log",
      message: `Executed ${merged.executedSteps.length} steps across ${testExecution.pagesVisited.length} pages`,
      level: "info",
    });
  } finally {
    await browserPool.closeAll();
  }

  emitValidationPhaseComplete(onProgress, "execution");
}
