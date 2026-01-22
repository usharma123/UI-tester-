import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../config.js";
import type { Report, Evidence, ExecutedStep, SnapshotEntry, ErrorEntry, Step, PagePlan } from "./types.js";
import type { ProgressCallback, SSEEvent, QAPhase, PageStatus } from "../web/types.js";
import { createAgentBrowser, type AgentBrowser } from "../agentBrowser.js";
import { createPlan, createPagePlan } from "./planner.js";
import { evaluateEvidence } from "./judge.js";
import { ensureDir } from "../utils/fs.js";
import { getTimestamp } from "../utils/time.js";
import { fetchSitemap, crawlSitemap, formatSitemapForPlanner, type SitemapResult } from "../utils/sitemap.js";
import { createBrowserPool } from "../utils/browserPool.js";
import { testPagesInParallel, mergeParallelResults, type ParallelTestCallbacks } from "./parallelTester.js";
import * as convex from "../web/convex.js";

export interface StreamingRunOptions {
  config: Config;
  url: string;
  goals?: string;
  convexRunId: string;
  onProgress: ProgressCallback;
}

export interface StreamingRunResult {
  report: Report;
  evidence: Evidence;
}

// Helper to emit events with timestamp
function emit(callback: ProgressCallback, event: Omit<SSEEvent, "timestamp">) {
  callback({ ...event, timestamp: Date.now() } as SSEEvent);
}

// Helper to emit phase events
function emitPhaseStart(callback: ProgressCallback, phase: QAPhase) {
  emit(callback, { type: "phase_start", phase });
}

function emitPhaseComplete(callback: ProgressCallback, phase: QAPhase) {
  emit(callback, { type: "phase_complete", phase });
}

// Check if step type should trigger screenshot
function shouldScreenshotAfter(stepType: string): boolean {
  return ["click", "open"].includes(stepType);
}

function shouldSnapshotAfter(stepType: string): boolean {
  return ["click", "fill", "press"].includes(stepType);
}

/**
 * Check if error should block the entire test run
 * Only browser crashes/disconnects should block - timeouts should skip and continue
 */
function isBlockingError(error: string): boolean {
  const blockingPatterns = [
    "crashed",
    "disconnected",
    "target closed",
    "session closed",
    "browser has been closed",
    "protocol error",
  ];

  const lowerError = error.toLowerCase();
  return blockingPatterns.some((pattern) => lowerError.includes(pattern));
}

/**
 * Check if error is a timeout that should skip the current action/page
 * These errors should NOT block the entire run
 */
function isSkippableError(error: string): boolean {
  const skippablePatterns = [
    "timeout",
    "navigation failed",
    "net::",
    "err_connection",
    "element not found",
    "no element matches",
  ];

  const lowerError = error.toLowerCase();
  return skippablePatterns.some((pattern) => lowerError.includes(pattern));
}

/**
 * Create a URL-safe slug from a URL for use in filenames
 */
function slugify(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\//g, "-").replace(/^-|-$/g, "");
    return path || "home";
  } catch {
    return "page";
  }
}

// Check if error is due to multiple elements matching
function isMultipleMatchError(error: string): { matched: boolean; count?: number; selector?: string } {
  // Strip ANSI escape codes first
  const cleanError = error.replace(/\x1b\[[0-9;]*m/g, "").replace(/\[[\d;]*m/g, "");
  
  // Pattern: Selector "XXX" matched N elements
  const match = cleanError.match(/Selector "([^"]+)" matched (\d+) elements/);
  if (match) {
    return { matched: true, selector: match[1], count: parseInt(match[2], 10) };
  }
  return { matched: false };
}

// Make a selector more specific by targeting first element
function makeFirstSelector(selector: string): string {
  // For text selectors, use first match
  if (selector.startsWith("text=") || selector.startsWith("text:")) {
    return `${selector} >> nth=0`;
  }
  // For link selectors
  if (selector.startsWith("a:") || selector.includes(":has-text")) {
    return `${selector} >> nth=0`;
  }
  // For CSS selectors
  if (selector.includes(" ") || selector.includes(">")) {
    return `${selector}:first-of-type`;
  }
  // Default: add nth=0
  return `${selector} >> nth=0`;
}

async function executeStep(
  browser: AgentBrowser,
  step: Step,
  screenshotDir: string,
  stepIndex: number
): Promise<string | undefined> {
  switch (step.type) {
    case "open":
      if (!step.selector) {
        throw new Error("open step requires a URL in selector field");
      }
      await browser.open(step.selector);
      return `Opened ${step.selector}`;

    case "snapshot":
      const snapshot = await browser.snapshot();
      return `Snapshot captured (${snapshot.length} chars)`;

    case "click":
      if (!step.selector) {
        throw new Error("click step requires selector");
      }
      await browser.click(step.selector);
      return `Clicked ${step.selector}`;

    case "fill":
      if (!step.selector || !step.text) {
        throw new Error("fill step requires selector and text");
      }
      await browser.fill(step.selector, step.text);
      return `Filled ${step.selector} with "${step.text}"`;

    case "press":
      if (!step.key) {
        throw new Error("press step requires key");
      }
      await browser.press(step.key);
      return `Pressed ${step.key}`;

    case "getText":
      if (!step.selector) {
        throw new Error("getText step requires selector");
      }
      const text = await browser.getText(step.selector);
      return `Text: ${text}`;

    case "screenshot":
      const filename = step.path || `step-${String(stepIndex).padStart(2, "0")}.png`;
      const filepath = join(screenshotDir, filename);
      await browser.screenshot(filepath);
      return `Screenshot saved to ${filepath}`;

    default:
      throw new Error(`Unknown step type: ${(step as Step).type}`);
  }
}

export async function runQAStreaming(options: StreamingRunOptions): Promise<StreamingRunResult> {
  const { config, url, convexRunId, onProgress } = options;
  const goals = options.goals || config.goals;
  const timestamp = getTimestamp();

  // Use temp directory for screenshots (will be uploaded to Convex)
  const screenshotDir = join(tmpdir(), `qa-screenshots-${timestamp}`);
  await ensureDir(screenshotDir);

  const browser = createAgentBrowser({
    timeout: config.browserTimeout,
    navigationTimeout: config.navigationTimeout,
    actionTimeout: config.actionTimeout,
    maxRetries: config.maxRetries,
    retryDelayMs: config.retryDelayMs,
    debug: process.env.DEBUG === "true",
  });

  // Map from local paths to Convex URLs
  const screenshotUrlMap: Record<string, string> = {};

  // Helper to upload screenshot to Convex and emit event
  async function uploadAndEmitScreenshot(
    localPath: string,
    stepIndex: number,
    label: string
  ): Promise<string> {
    try {
      if (convex.isConvexConfigured()) {
        const { url } = await convex.uploadScreenshot(localPath, convexRunId, stepIndex, label);
        screenshotUrlMap[localPath] = url;
        emit(onProgress, { type: "screenshot", url, stepIndex, label });
        return url;
      } else {
        // Fallback: just emit local path
        emit(onProgress, { type: "screenshot", url: localPath, stepIndex, label });
        return localPath;
      }
    } catch (error) {
      emit(onProgress, {
        type: "log",
        message: `Failed to upload screenshot: ${error}`,
        level: "warn",
      });
      return localPath;
    }
  }

  try {
    // === Phase 1: Init ===
    emitPhaseStart(onProgress, "init");
    emit(onProgress, { type: "log", message: `Opening URL: ${url}`, level: "info" });

    await browser.open(url);
    const initialSnapshot = await browser.snapshot();

    // Take initial screenshot and upload
    const initialScreenshotPath = join(screenshotDir, "00-initial.png");
    await browser.screenshot(initialScreenshotPath);
    await uploadAndEmitScreenshot(initialScreenshotPath, 0, "Initial page load");

    emitPhaseComplete(onProgress, "init");

    // === Phase 2: Discovery ===
    emitPhaseStart(onProgress, "discovery");
    emit(onProgress, { type: "log", message: "Discovering site structure...", level: "info" });

    let sitemap: SitemapResult;
    try {
      sitemap = await fetchSitemap(url, 15000);

      emit(onProgress, {
        type: "log",
        message: `Static discovery found ${sitemap.urls.length} pages via ${sitemap.source}`,
        level: "info",
      });

      // If static discovery found very few pages, try dynamic crawling
      if (sitemap.urls.length < 3) {
        emit(onProgress, {
          type: "log",
          message: "Few pages found, crawling links for more...",
          level: "info",
        });

        try {
          const crawledSitemap = await crawlSitemap(browser, url, config.maxPages);

          // Use crawled results if it found more pages
          if (crawledSitemap.urls.length > sitemap.urls.length) {
            emit(onProgress, {
              type: "log",
              message: `Link crawling found ${crawledSitemap.urls.length} pages`,
              level: "info",
            });
            sitemap = crawledSitemap;
          }
        } catch (crawlError) {
          emit(onProgress, {
            type: "log",
            message: `Link crawling failed: ${crawlError}`,
            level: "warn",
          });
        }
      }

      // If still no pages found, fall back to base URL only
      if (sitemap.urls.length === 0) {
        const baseUrl = url.replace(/\/$/, "");
        sitemap = {
          urls: [{ loc: baseUrl }],
          source: "none",
        };
        emit(onProgress, {
          type: "log",
          message: "No pages discovered, testing homepage only",
          level: "info",
        });
      }

      emit(onProgress, {
        type: "sitemap",
        urls: sitemap.urls.map(u => ({ loc: u.loc, lastmod: u.lastmod, priority: u.priority })),
        source: sitemap.source,
        totalPages: sitemap.urls.length,
      });
      emit(onProgress, {
        type: "log",
        message: `Final discovery: ${sitemap.urls.length} pages via ${sitemap.source}`,
        level: "info",
      });
    } catch (error) {
      emit(onProgress, {
        type: "log",
        message: `Sitemap discovery failed: ${error}`,
        level: "warn",
      });
      sitemap = { urls: [{ loc: url }], source: "none" };
    }

    emitPhaseComplete(onProgress, "discovery");

    // === Phase 3: Planning ===
    emitPhaseStart(onProgress, "planning");
    emit(onProgress, { type: "log", message: `Creating test plan for: ${goals}`, level: "info" });
    
    // Include sitemap info in the planning context
    const sitemapContext = formatSitemapForPlanner(sitemap);
    const sitemapUrls = sitemap.urls.map(u => u.loc);

    const { plan } = await createPlan(config, url, goals, initialSnapshot, sitemapContext, sitemapUrls);

    emit(onProgress, {
      type: "plan_created",
      plan,
      totalSteps: plan.steps.length,
    });

    emitPhaseComplete(onProgress, "planning");

    // === Phase 4: Per-Page Traversal (Systematic Testing) ===
    emitPhaseStart(onProgress, "traversal");

    const parallelCount = config.parallelBrowsers;
    emit(onProgress, {
      type: "log",
      message: `Starting parallel page testing with ${parallelCount} browsers...`,
      level: "info"
    });

    // Limit pages to test based on config
    const pagesToTest = sitemap.urls.slice(0, config.maxPages);

    // Progress tracking
    let pagesCompleted = 0;
    const pageProgress = {
      tested: 0,
      skipped: 0,
      remaining: pagesToTest.length,
      total: pagesToTest.length,
    };

    // Create browser pool for parallel execution
    const browserPool = createBrowserPool(parallelCount, {
      timeout: config.browserTimeout,
      navigationTimeout: config.navigationTimeout,
      actionTimeout: config.actionTimeout,
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
      debug: process.env.DEBUG === "true",
    });

    // Set up callbacks for parallel tester
    const parallelCallbacks: ParallelTestCallbacks = {
      onPageStart: (url, pageIndex) => {
        emit(onProgress, {
          type: "page_start",
          url,
          pageIndex,
          totalPages: pagesToTest.length,
        });
        emit(onProgress, {
          type: "log",
          message: `[Browser ${browserPool.getActiveCount()}/${parallelCount}] Testing page ${pageIndex + 1}/${pagesToTest.length}: ${url}`,
          level: "info",
        });
      },

      onPageComplete: (result) => {
        pagesCompleted++;

        // Update progress
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
        return await uploadAndEmitScreenshot(localPath, stepIndex, label);
      },
    };

    // Run parallel page testing
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
      // Always close all browsers in the pool
      await browserPool.closeAll();
    }

    // Merge results from parallel execution
    const merged = mergeParallelResults(parallelResults);
    const executedSteps = merged.executedSteps;
    const snapshots = merged.snapshots;
    const errors = merged.errors;
    const screenshotMap = merged.screenshotMap;

    // Calculate global step index for additional steps
    let globalStepIndex = executedSteps.length > 0
      ? Math.max(...executedSteps.map(s => s.index)) + 1
      : 0;
    let screenshotCounter = Object.keys(screenshotMap).length + 1;

    // Check if any page had a blocking error
    let blocked = parallelResults.some(r => r.status === "failed");

    emitPhaseComplete(onProgress, "traversal");

    // Also run the original plan steps for any additional testing
    // (This ensures we still test things the LLM identified in the initial plan)
    emitPhaseStart(onProgress, "execution");
    emit(onProgress, { type: "log", message: "Executing additional planned tests...", level: "info" });

    // Filter plan steps to only include those that navigate to URLs we haven't tested
    const testedUrls = new Set(pagesToTest.map(p => p.loc));
    const additionalSteps = plan.steps.filter(step => {
      if (step.type === "open" && step.selector) {
        return !testedUrls.has(step.selector);
      }
      // Include non-navigation steps
      return step.type !== "open";
    }).slice(0, Math.max(0, config.maxSteps - globalStepIndex));

    for (let i = 0; i < additionalSteps.length && !blocked; i++) {
      const step = additionalSteps[i];

      emit(onProgress, {
        type: "step_start",
        stepIndex: globalStepIndex,
        step,
        totalSteps: additionalSteps.length,
      });

      const executedStep: ExecutedStep = {
        index: globalStepIndex,
        step,
        status: "success",
        timestamp: Date.now(),
      };

      try {
        const result = await executeStep(browser, step, screenshotDir, globalStepIndex);
        executedStep.result = result;

        let stepScreenshotUrl: string | undefined;
        if (shouldScreenshotAfter(step.type)) {
          const filename = `step-${String(screenshotCounter).padStart(2, "0")}-after.png`;
          const filepath = join(screenshotDir, filename);
          try {
            await browser.screenshot(filepath);
            screenshotMap[filepath] = globalStepIndex;
            stepScreenshotUrl = await uploadAndEmitScreenshot(filepath, globalStepIndex, `After ${step.type}`);
            executedStep.screenshotPath = filepath;
            screenshotCounter++;
          } catch {
            // Ignore screenshot errors
          }
        }

        emit(onProgress, {
          type: "step_complete",
          stepIndex: globalStepIndex,
          status: "success",
          result: executedStep.result,
          screenshotUrl: stepScreenshotUrl,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        executedStep.status = "failed";
        executedStep.error = errorMessage;
        errors.push({ stepIndex: globalStepIndex, error: errorMessage });

        if (isBlockingError(errorMessage)) {
          executedStep.status = "blocked";
          blocked = true;
        }

        emit(onProgress, {
          type: "step_complete",
          stepIndex: globalStepIndex,
          status: executedStep.status,
          error: errorMessage,
        });
      }

      executedSteps.push(executedStep);
      globalStepIndex++;
    }

    const evidence: Evidence = {
      plan,
      executedSteps,
      snapshots,
      errors,
      screenshotMap,
    };

    emitPhaseComplete(onProgress, "execution");

    // === Phase 4: Evaluation ===
    emitPhaseStart(onProgress, "evaluation");
    emit(onProgress, { type: "log", message: "Evaluating test results...", level: "info" });

    // Create a temporary evidence file path for the judge
    const evidenceFilePath = `convex://runs/${convexRunId}/evidence`;

    const { report: evaluatedReport } = await evaluateEvidence(config, evidence, evidenceFilePath);

    // Replace local screenshot paths with Convex URLs in the report
    const reportWithUrls: Report = {
      ...evaluatedReport,
      artifacts: {
        ...evaluatedReport.artifacts,
        screenshots: evaluatedReport.artifacts.screenshots.map(
          (path) => screenshotUrlMap[path] || path
        ),
      },
    };

    // Also update issue evidence paths
    const issuesWithUrls = reportWithUrls.issues.map((issue) => ({
      ...issue,
      evidence: issue.evidence.map((path) => screenshotUrlMap[path] || path),
    }));
    reportWithUrls.issues = issuesWithUrls;

    // Also update evidence screenshot paths
    const evidenceWithUrls: Evidence = {
      ...evidence,
      screenshotMap: Object.fromEntries(
        Object.entries(evidence.screenshotMap).map(([path, idx]) => [
          screenshotUrlMap[path] || path,
          idx,
        ])
      ),
    };

    // Save to Convex
    if (convex.isConvexConfigured()) {
      try {
        await convex.completeRun(
          convexRunId,
          reportWithUrls.score,
          reportWithUrls.summary,
          reportWithUrls,
          evidenceWithUrls
        );
      } catch (error) {
        emit(onProgress, {
          type: "log",
          message: `Failed to save to Convex: ${error}`,
          level: "warn",
        });
      }
    }

    emitPhaseComplete(onProgress, "evaluation");

    // Emit completion
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

    // Try to fail the run in Convex
    if (convex.isConvexConfigured()) {
      try {
        await convex.failRun(convexRunId, errorMessage);
      } catch (convexError) {
        // Ignore convex errors during error handling
      }
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

    // Clean up temp directory
    try {
      const { rm } = await import("node:fs/promises");
      await rm(screenshotDir, { recursive: true, force: true });
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
  }
}
