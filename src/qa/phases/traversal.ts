import { join } from "node:path";
import type { Config } from "../../config.js";
import type { AgentBrowser } from "../../agentBrowser.js";
import type { ProgressCallback } from "../progress-types.js";
import type { AuditEntry, ExecutedStep, SnapshotEntry, ErrorEntry, Step } from "../types.js";
import type { SitemapResult, SitemapUrl } from "../../utils/sitemap.js";
import { emit, emitPhaseStart, emitPhaseComplete } from "../../core/events/emit.js";
import { createBrowserPool } from "../../utils/browserPool.js";
import { testPagesInParallel, mergeParallelResults, type ParallelTestCallbacks } from "../parallelTester.js";
import { createStateTracker } from "../state.js";
import { createBudgetTracker } from "../budget.js";
import { createCoverageTracker } from "../coverage.js";
import { createExplorer } from "../explorer.js";
import { createLLMExplorer } from "../llm-explorer.js";

export interface TraversalPhaseOptions {
  browser: AgentBrowser;
  config: Config;
  url: string;
  sitemap: SitemapResult;
  screenshotDir: string;
  onProgress: ProgressCallback;
  saveAndEmitScreenshot: (localPath: string, stepIndex: number, label: string) => Promise<string>;
}

export interface TraversalPhaseResult {
  executedSteps: ExecutedStep[];
  snapshots: SnapshotEntry[];
  errors: ErrorEntry[];
  screenshotMap: Record<string, number>;
  pageAudits: AuditEntry[];
  globalStepIndex: number;
  screenshotCounter: number;
  blocked: boolean;
  pagesToTest: SitemapUrl[];
}

export async function runTraversalPhase(options: TraversalPhaseOptions): Promise<TraversalPhaseResult> {
  const { browser, config, url, sitemap, screenshotDir, onProgress, saveAndEmitScreenshot } = options;

  emitPhaseStart(onProgress, "traversal");

  let executedSteps: ExecutedStep[] = [];
  let snapshots: SnapshotEntry[] = [];
  let errors: ErrorEntry[] = [];
  let screenshotMap: Record<string, number> = {};
  let pageAudits: AuditEntry[] = [];
  let globalStepIndex = 0;
  let screenshotCounter = 1;
  let blocked = false;

  const pagesToTest = sitemap.urls.slice(0, config.maxPages);
  const useLLMGuided = config.explorationMode === "llm_guided" && config.llmNavigatorConfig?.enabled;

  if (useLLMGuided) {
    emit(onProgress, {
      type: "log",
      message: "Starting LLM-guided exploration...",
      level: "info",
    });

    const stateTracker = createStateTracker();
    const budgetTracker = createBudgetTracker(config.budgetConfig);
    const coverageTracker = createCoverageTracker();

    const llmExplorer = createLLMExplorer(
      browser,
      coverageTracker,
      stateTracker,
      budgetTracker,
      config.openRouterApiKey,
      {
        llmConfig: config.llmNavigatorConfig,
        maxDepth: config.budgetConfig.maxDepth,
      }
    );

    const llmResult = await llmExplorer.explore(url, {
      onStart: () => {
        emit(onProgress, { type: "log", message: "LLM exploration started", level: "info" });
      },
      onBeforeAction: (edge, depth) => {
        emit(onProgress, {
          type: "step_start",
          stepIndex: globalStepIndex,
          step: {
            type: edge.action.type as Step["type"],
            selector: edge.action.selector,
            goal: `${edge.action.type} on "${edge.action.element.text?.slice(0, 50) || edge.action.selector}"`,
          },
          totalSteps: config.budgetConfig.maxTotalSteps,
        });
        emit(onProgress, {
          type: "log",
          message: `[Depth ${depth}] ${edge.action.type} on "${edge.action.element.text?.slice(0, 30) || edge.action.selector}"`,
          level: "info",
        });
      },
      onAfterAction: async (edge, success, newState) => {
        const stateInfo = newState ? " (new state)" : "";
        emit(onProgress, {
          type: "step_complete",
          stepIndex: globalStepIndex,
          status: success ? "success" : "failed",
          result: success ? `Completed ${edge.action.type}${stateInfo}` : undefined,
          error: success ? undefined : edge.lastError,
        });
        emit(onProgress, {
          type: "log",
          message: `Step ${globalStepIndex + 1} ${success ? "succeeded" : "failed"}${stateInfo}`,
          level: success ? "info" : "warn",
        });

        const filename = `step-${String(screenshotCounter).padStart(2, "0")}-after.png`;
        const filepath = join(screenshotDir, filename);
        try {
          await browser.screenshot(filepath);
          screenshotMap[filepath] = globalStepIndex;
          await saveAndEmitScreenshot(filepath, globalStepIndex, `After ${edge.action.type}`);
          screenshotCounter++;
        } catch {
          // Ignore screenshot errors
        }

        const executedStep: ExecutedStep = {
          index: globalStepIndex,
          step: {
            type: edge.action.type as Step["type"],
            selector: edge.action.selector,
            note: `${edge.action.type} on "${edge.action.element.text?.slice(0, 50) || edge.action.selector}"`,
          },
          status: success ? "success" : "failed",
          timestamp: Date.now(),
          result: success ? `Completed ${edge.action.type}` : undefined,
          error: success ? undefined : edge.lastError,
        };
        executedSteps.push(executedStep);

        if (!success && edge.lastError) {
          errors.push({ stepIndex: globalStepIndex, error: edge.lastError });
        }

        globalStepIndex++;
      },
      onBacktrack: (node, depth) => {
        emit(onProgress, {
          type: "log",
          message: `Backtracking to ${node.url} (depth ${depth})`,
          level: "info",
        });
      },
      onComplete: (result) => {
        emit(onProgress, {
          type: "log",
          message: `LLM exploration complete: ${result.terminationReason} (${result.totalSteps} steps, ${result.uniqueStates} states, ${result.uniqueUrls} URLs)`,
          level: "info",
        });
      },
      onLog: (message, level) => {
        emit(onProgress, { type: "log", message, level });
      },
    });

    const graphStats = llmResult.graph.getStats();
    emit(onProgress, {
      type: "log",
      message: `Graph: ${graphStats.totalNodes} nodes, ${graphStats.totalEdges} edges, ${graphStats.exploredEdges} explored`,
      level: "info",
    });

    blocked = llmResult.terminationReason === "error";
  } else if (config.coverageGuidedEnabled) {
    emit(onProgress, {
      type: "log",
      message: "Starting coverage-guided exploration...",
      level: "info",
    });

    const stateTracker = createStateTracker();
    const budgetTracker = createBudgetTracker(config.budgetConfig);
    const coverageTracker = createCoverageTracker();

    const explorer = createExplorer(browser, coverageTracker, stateTracker, budgetTracker, {
      strategy: config.explorationMode,
      beamWidth: config.beamWidth,
    });

    const explorationResult = await explorer.explore({
      onStart: () => {
        emit(onProgress, { type: "log", message: "Exploration started", level: "info" });
      },
      onBeforeAction: (action, stepIndex) => {
        emit(onProgress, {
          type: "step_start",
          stepIndex,
          step: {
            type: action.actionType as Step["type"],
            selector: action.selector,
            goal: `${action.actionType} on "${action.element.text.slice(0, 50)}"`,
          },
          totalSteps: config.budgetConfig.maxTotalSteps,
        });
        emit(onProgress, {
          type: "log",
          message: `Step ${stepIndex + 1}: ${action.actionType} on "${action.element.text.slice(0, 30)}"`,
          level: "info",
        });
      },
      onAfterAction: async (step) => {
        const gain = step.coverageGain.hasGain ? ` (+${step.coverageGain.totalGain} coverage)` : "";
        emit(onProgress, {
          type: "step_complete",
          stepIndex: step.index,
          status: step.success ? "success" : "failed",
          result: step.success ? `Completed ${step.action.actionType}${gain}` : undefined,
          error: step.error,
        });
        emit(onProgress, {
          type: "log",
          message: `Step ${step.index + 1} ${step.success ? "succeeded" : "failed"}${gain}`,
          level: step.success ? "info" : "warn",
        });

        const filename = `step-${String(screenshotCounter).padStart(2, "0")}-after.png`;
        const filepath = join(screenshotDir, filename);
        try {
          await browser.screenshot(filepath);
          screenshotMap[filepath] = step.index;
          await saveAndEmitScreenshot(filepath, step.index, `After ${step.action.actionType}`);
          screenshotCounter++;
        } catch {
          // Ignore screenshot errors
        }

        const executedStep: ExecutedStep = {
          index: step.index,
          step: {
            type: step.action.actionType as Step["type"],
            selector: step.action.selector,
            note: `${step.action.actionType} on "${step.action.element.text.slice(0, 50)}"`,
          },
          status: step.success ? "success" : "failed",
          timestamp: step.timestamp,
          result: step.success ? `Completed ${step.action.actionType}` : undefined,
          error: step.error,
        };
        executedSteps.push(executedStep);

        if (!step.success && step.error) {
          errors.push({ stepIndex: step.index, error: step.error });
        }
      },
      onComplete: (result) => {
        emit(onProgress, {
          type: "log",
          message: `Exploration complete: ${result.terminationReason} (${result.steps.length} steps, ${result.uniqueStates} states)`,
          level: "info",
        });
      },
      onError: (error, stepIndex) => {
        emit(onProgress, {
          type: "log",
          message: `Error at step ${stepIndex}: ${error.message}`,
          level: "error",
        });
      },
      onLog: (message, level) => {
        emit(onProgress, { type: "log", message, level });
      },
    });

    globalStepIndex = explorationResult.steps.length;

    const stats = coverageTracker.getStats();
    emit(onProgress, {
      type: "log",
      message: `Coverage: ${stats.coverageScore.toFixed(0)}/100 | URLs: ${stats.totalUrls} | Forms: ${stats.totalForms} | Elements: ${stats.totalInteractions}`,
      level: "info",
    });

    blocked = explorationResult.terminationReason === "error";
  } else {
    const parallelCount = config.parallelBrowsers;
    emit(onProgress, {
      type: "log",
      message: `Starting parallel page testing with ${parallelCount} browsers...`,
      level: "info",
    });

    let pagesCompleted = 0;
    const pageProgress = {
      tested: 0,
      skipped: 0,
      remaining: pagesToTest.length,
      total: pagesToTest.length,
    };

    const browserPool = createBrowserPool(parallelCount, {
      timeout: config.browserTimeout,
      navigationTimeout: config.navigationTimeout,
      actionTimeout: config.actionTimeout,
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
      debug: process.env.DEBUG === "true",
    });

    const parallelCallbacks: ParallelTestCallbacks = {
      onPageStart: (pageUrl, pageIndex) => {
        emit(onProgress, {
          type: "page_start",
          url: pageUrl,
          pageIndex,
          totalPages: pagesToTest.length,
        });
        emit(onProgress, {
          type: "log",
          message: `[Browser ${browserPool.getActiveCount()}/${parallelCount}] Testing page ${pageIndex + 1}/${pagesToTest.length}: ${pageUrl}`,
          level: "info",
        });
      },
      onPageComplete: (result) => {
        pagesCompleted++;

        if (result.status === "success") {
          pageProgress.tested++;
        } else if (result.status === "skipped") {
          pageProgress.skipped++;
        }
        pageProgress.remaining = pagesToTest.length - pagesCompleted;

        emit(onProgress, {
          type: "page_complete",
          url: result.url,
          pageIndex: result.pageIndex,
          status: result.status,
          screenshotUrl: result.screenshotUrl,
          stepsExecuted: result.stepsExecuted,
          error: result.error,
        });

        emit(onProgress, {
          type: "pages_progress",
          tested: pageProgress.tested,
          skipped: pageProgress.skipped,
          remaining: pageProgress.remaining,
          total: pageProgress.total,
        });
      },
      onStepStart: (pageIndex, stepIndex, step, totalSteps) => {
        emit(onProgress, {
          type: "step_start",
          stepIndex,
          step,
          totalSteps,
        });
      },
      onStepComplete: (pageIndex, stepIndex, status, result, error) => {
        emit(onProgress, {
          type: "step_complete",
          stepIndex,
          status,
          result,
          error,
        });
      },
      onLog: (message, level) => {
        emit(onProgress, { type: "log", message, level });
      },
      uploadScreenshot: async (localPath, stepIndex, label) => {
        return await saveAndEmitScreenshot(localPath, stepIndex, label);
      },
    };

    let parallelResults;
    try {
      parallelResults = await testPagesInParallel(
        pagesToTest,
        browserPool,
        config,
        screenshotDir,
        parallelCallbacks
      );
    } finally {
      await browserPool.closeAll();
    }

    const merged = mergeParallelResults(parallelResults);
    executedSteps = merged.executedSteps;
    snapshots = merged.snapshots;
    errors = merged.errors;
    screenshotMap = merged.screenshotMap;
    pageAudits = merged.audits;

    globalStepIndex = executedSteps.length > 0
      ? Math.max(...executedSteps.map((s) => s.index)) + 1
      : 0;
    screenshotCounter = Object.keys(screenshotMap).length + 1;

    blocked = parallelResults.some((r) => r.status === "failed");
  }

  emitPhaseComplete(onProgress, "traversal");

  return {
    executedSteps,
    snapshots,
    errors,
    screenshotMap,
    pageAudits,
    globalStepIndex,
    screenshotCounter,
    blocked,
    pagesToTest,
  };
}
