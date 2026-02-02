import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../config.js";
import type { Report, Evidence } from "./types.js";
import type { ProgressCallback } from "./progress-types.js";
import { emit } from "../core/events/emit.js";
import { createAgentBrowser } from "../agentBrowser.js";
import { ensureDir } from "../utils/fs.js";
import { getTimestamp } from "../utils/time.js";
import * as localStorage from "../storage/local.js";
import { runInitPhase } from "./phases/init.js";
import { runDiscoveryPhase } from "./phases/discovery.js";
import { runPlanningPhase } from "./phases/planning.js";
import { runTraversalPhase } from "./phases/traversal.js";
import { runExecutionPhase } from "./phases/execution.js";
import { runEvaluationPhase } from "./phases/evaluation.js";

export interface StreamingRunOptions {
  config: Config;
  url: string;
  goals?: string;
  convexRunId?: string; // Optional run ID, will be auto-generated if not provided
  onProgress: ProgressCallback;
}

export interface StreamingRunResult {
  report: Report;
  evidence: Evidence;
}

export async function runQAStreaming(options: StreamingRunOptions): Promise<StreamingRunResult> {
  const { config, url, onProgress } = options;
  const goals = options.goals || config.goals;
  const timestamp = getTimestamp();

  const runId = options.convexRunId || `cli-${Date.now()}`;

  const screenshotDir = join(tmpdir(), `qa-screenshots-${timestamp}`);
  await ensureDir(screenshotDir);

  await localStorage.createLocalRun(runId, url, goals);

  const browser = createAgentBrowser({
    timeout: config.browserTimeout,
    navigationTimeout: config.navigationTimeout,
    actionTimeout: config.actionTimeout,
    maxRetries: config.maxRetries,
    retryDelayMs: config.retryDelayMs,
    debug: process.env.DEBUG === "true",
  });

  const screenshotUrlMap: Record<string, string> = {};

  async function saveAndEmitScreenshot(
    localPath: string,
    stepIndex: number,
    label: string
  ): Promise<string> {
    try {
      const { localPath: savedPath } = await localStorage.saveLocalScreenshot(
        runId,
        localPath,
        stepIndex,
        label
      );
      screenshotUrlMap[localPath] = savedPath;
      emit(onProgress, { type: "screenshot", url: savedPath, stepIndex, label });
      return savedPath;
    } catch (error) {
      emit(onProgress, {
        type: "log",
        message: `Failed to save screenshot: ${error}`,
        level: "warn",
      });
      return localPath;
    }
  }

  try {
    const { initialSnapshot, initialScreenshotPath, runAudits } = await runInitPhase({
      browser,
      config,
      url,
      screenshotDir,
      onProgress,
      saveAndEmitScreenshot,
    });

    const sitemap = await runDiscoveryPhase({
      browser,
      config,
      url,
      onProgress,
    });

    const { plan } = await runPlanningPhase({
      config,
      url,
      goals,
      initialSnapshot,
      sitemap,
      onProgress,
    });

    const traversalResult = await runTraversalPhase({
      browser,
      config,
      url,
      sitemap,
      screenshotDir,
      onProgress,
      saveAndEmitScreenshot,
    });

    const executionResult = await runExecutionPhase({
      browser,
      config,
      plan,
      pagesToTest: traversalResult.pagesToTest,
      screenshotDir,
      onProgress,
      saveAndEmitScreenshot,
      startingStepIndex: traversalResult.globalStepIndex,
      startingScreenshotCounter: traversalResult.screenshotCounter,
      blocked: traversalResult.blocked,
    });

    const executedSteps = [...traversalResult.executedSteps, ...executionResult.executedSteps];
    const snapshots = [...traversalResult.snapshots];
    const errors = [...traversalResult.errors, ...executionResult.errors];
    const screenshotMap = { ...traversalResult.screenshotMap, ...executionResult.screenshotMap };
    const allAudits = [...runAudits, ...traversalResult.pageAudits];

    const evidence: Evidence = {
      plan,
      executedSteps,
      snapshots,
      errors,
      screenshotMap,
      audits: allAudits.length > 0 ? allAudits : undefined,
    };

    if (initialScreenshotPath) {
      evidence.screenshotMap[initialScreenshotPath] = -1;
    }
    for (const audit of allAudits) {
      if (audit.screenshotPath) {
        evidence.screenshotMap[audit.screenshotPath] = -1;
      }
    }

    const { report: reportWithUrls, evidence: evidenceWithUrls } = await runEvaluationPhase({
      config,
      onProgress,
      runId,
      evidence,
      screenshotUrlMap,
    });

    emit(onProgress, {
      type: "complete",
      report: reportWithUrls,
      evidence: evidenceWithUrls,
    });

    return {
      report: reportWithUrls,
      evidence: evidenceWithUrls,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      await localStorage.failLocalRun(runId, errorMessage);
    } catch {
      // Ignore local storage errors during error handling
    }

    emit(onProgress, {
      type: "error",
      message: errorMessage,
    });

    throw error;
  } finally {
    try {
      await browser.close();
    } catch (closeError) {
      // Ignore close errors
    }
  }
}
