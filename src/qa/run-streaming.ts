import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../config.js";
import type { Report, Evidence, ExecutedStep, SnapshotEntry, ErrorEntry, Step, PagePlan, AuditEntry } from "./types.js";
import type { ProgressCallback, SSEEvent, QAPhase, PageStatus } from "./progress-types.js";
import { createAgentBrowser, type AgentBrowser } from "../agentBrowser.js";
import { createPlan, createPagePlan } from "./planner.js";
import { evaluateEvidence } from "./judge.js";
import { getViewportInfo, runDomAudit, trySetViewport, runFullAudit } from "./audits.js";
import { ensureDir } from "../utils/fs.js";
import { getTimestamp } from "../utils/time.js";
import { fetchSitemap, crawlSitemap, formatSitemapForPlanner, type SitemapResult } from "../utils/sitemap.js";
import { createBrowserPool } from "../utils/browserPool.js";
import { testPagesInParallel, mergeParallelResults, type ParallelTestCallbacks } from "./parallelTester.js";
import * as localStorage from "../storage/local.js";

// Coverage-guided exploration imports
import { createStateTracker, captureStateFingerprint } from "./state.js";
import { createBudgetTracker } from "./budget.js";
import { createCoverageTracker, collectPageCoverage, getCoverageRecommendations } from "./coverage.js";
import { createExplorer, type ExplorationResult } from "./explorer.js";
import { createAuthManager } from "./auth.js";

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

// Helper to emit events with timestamp
function emit<T extends { type: string }>(callback: ProgressCallback, event: T) {
  callback({ ...event, timestamp: Date.now() } as unknown as SSEEvent);
}

// Helper to emit phase events
function emitPhaseStart(callback: ProgressCallback, phase: QAPhase) {
  emit(callback, { type: "phase_start", phase });
}

function emitPhaseComplete(callback: ProgressCallback, phase: QAPhase) {
  emit(callback, { type: "phase_complete", phase });
}

// Check if step type should trigger screenshot
function shouldScreenshotBefore(stepType: string, captureBeforeAfter: boolean): boolean {
  if (!captureBeforeAfter) return false;
  return ["click", "fill", "press"].includes(stepType);
}

function shouldScreenshotAfter(stepType: string, captureBeforeAfter: boolean): boolean {
  if (captureBeforeAfter) {
    return ["click", "open", "fill", "press"].includes(stepType);
  }
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
  const { config, url, onProgress } = options;
  const goals = options.goals || config.goals;
  const timestamp = getTimestamp();
  
  // Generate run ID for this session
  const runId = options.convexRunId || `cli-${Date.now()}`;

  // Use temp directory for screenshots (will be saved locally)
  const screenshotDir = join(tmpdir(), `qa-screenshots-${timestamp}`);
  await ensureDir(screenshotDir);

  // Create local run record
  await localStorage.createLocalRun(runId, url, goals);

  const runAudits: AuditEntry[] = [];
  let initialScreenshotPath: string | null = null;

  const browser = createAgentBrowser({
    timeout: config.browserTimeout,
    navigationTimeout: config.navigationTimeout,
    actionTimeout: config.actionTimeout,
    maxRetries: config.maxRetries,
    retryDelayMs: config.retryDelayMs,
    debug: process.env.DEBUG === "true",
  });

  // Map from local paths to saved paths
  const screenshotUrlMap: Record<string, string> = {};

  // Helper to save screenshot locally and emit event
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
    // === Phase 1: Init ===
    emitPhaseStart(onProgress, "init");
    emit(onProgress, { type: "log", message: `Opening URL: ${url}`, level: "info" });

    await browser.open(url);
    const initialSnapshot = await browser.snapshot();

    // Take initial screenshot and upload
    initialScreenshotPath = join(screenshotDir, "00-initial.png");
    await browser.screenshot(initialScreenshotPath);
    await saveAndEmitScreenshot(initialScreenshotPath, -1, "Initial page load");

    if (config.auditsEnabled) {
      emit(onProgress, { type: "log", message: "Running DOM audits...", level: "info" });
      try {
        const originalViewport = await getViewportInfo(browser);
        let resizeSupported = true;

        for (const viewport of config.viewports) {
          try {
            const { applied } = await trySetViewport(browser, viewport.width, viewport.height);
            if (!applied) {
              resizeSupported = false;
              break;
            }
          } catch {
            resizeSupported = false;
            break;
          }

          try {
            const auditScreenshot = join(screenshotDir, `audit-${viewport.label}.png`);
            await browser.screenshot(auditScreenshot);
            await saveAndEmitScreenshot(auditScreenshot, -1, `Audit ${viewport.label}`);
            const audit = await runDomAudit(browser, url, viewport.label);
            runAudits.push({ ...audit, screenshotPath: auditScreenshot });
          } catch (error) {
            emit(onProgress, {
              type: "log",
              message: `Audit failed for ${viewport.label}: ${error}`,
              level: "warn",
            });
          }
        }

        if (!resizeSupported) {
          emit(onProgress, {
            type: "log",
            message: "Viewport resize unsupported; falling back to default audit.",
            level: "warn",
          });
          const auditScreenshot = join(screenshotDir, "audit-default.png");
          await browser.screenshot(auditScreenshot);
          await saveAndEmitScreenshot(auditScreenshot, -1, "Audit default");
          const audit = await runDomAudit(browser, url, "default");
          runAudits.push({ ...audit, screenshotPath: auditScreenshot });
        }

        await trySetViewport(browser, originalViewport.width, originalViewport.height);
      } catch (error) {
        emit(onProgress, {
          type: "log",
          message: `DOM audits failed: ${error}`,
          level: "warn",
        });
      }
    }

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

    // === Phase 4: Traversal (Coverage-Guided or Parallel Page Testing) ===
    emitPhaseStart(onProgress, "traversal");

    // Shared result variables
    let executedSteps: ExecutedStep[] = [];
    let snapshots: SnapshotEntry[] = [];
    let errors: ErrorEntry[] = [];
    let screenshotMap: Record<string, number> = {};
    let pageAudits: AuditEntry[] = [];
    let globalStepIndex = 0;
    let screenshotCounter = 1;
    let blocked = false;
    
    // Pages to test - used in parallel mode and for filtering additional steps
    let pagesToTest = sitemap.urls.slice(0, config.maxPages);

    if (config.coverageGuidedEnabled) {
      // === Coverage-Guided Exploration Mode ===
      emit(onProgress, {
        type: "log",
        message: "Starting coverage-guided exploration...",
        level: "info"
      });

      // Create trackers for coverage-guided exploration
      const stateTracker = createStateTracker();
      const budgetTracker = createBudgetTracker(config.budgetConfig);
      const coverageTracker = createCoverageTracker();

      // Create explorer using the existing browser
      const explorer = createExplorer(browser, coverageTracker, stateTracker, budgetTracker, {
        strategy: config.explorationMode,
        beamWidth: config.beamWidth,
      });

      // Run exploration with callbacks
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

          // Take screenshot after each action
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

          // Convert exploration step to executed step
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

      // Update global step index
      globalStepIndex = explorationResult.steps.length;

      // Report coverage stats
      const stats = coverageTracker.getStats();
      emit(onProgress, {
        type: "log",
        message: `Coverage: ${stats.coverageScore.toFixed(0)}/100 | URLs: ${stats.totalUrls} | Forms: ${stats.totalForms} | Elements: ${stats.totalInteractions}`,
        level: "info",
      });

      // Check if exploration was blocked
      blocked = explorationResult.terminationReason === "error";

    } else {
      // === Traditional Parallel Page Testing Mode ===
      const parallelCount = config.parallelBrowsers;
      emit(onProgress, {
        type: "log",
        message: `Starting parallel page testing with ${parallelCount} browsers...`,
        level: "info"
      });

      // pagesToTest is already initialized before the if-else block

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
          return await saveAndEmitScreenshot(localPath, stepIndex, label);
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
      executedSteps = merged.executedSteps;
      snapshots = merged.snapshots;
      errors = merged.errors;
      screenshotMap = merged.screenshotMap;
      pageAudits = merged.audits;

      // Calculate global step index for additional steps
      globalStepIndex = executedSteps.length > 0
        ? Math.max(...executedSteps.map(s => s.index)) + 1
        : 0;
      screenshotCounter = Object.keys(screenshotMap).length + 1;

      // Check if any page had a blocking error
      blocked = parallelResults.some(r => r.status === "failed");
    }

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
        if (shouldScreenshotBefore(step.type, config.captureBeforeAfterScreenshots)) {
          const filename = `step-${String(screenshotCounter).padStart(2, "0")}-before.png`;
          const filepath = join(screenshotDir, filename);
          try {
            await browser.screenshot(filepath);
            screenshotMap[filepath] = globalStepIndex;
            await saveAndEmitScreenshot(filepath, globalStepIndex, `Before ${step.type}`);
            screenshotCounter++;
          } catch {
            // Ignore screenshot errors
          }
        }

        let result: string | undefined;
        let retryAttempt = 0;
        const maxRetries = 2;
        let currentStep = { ...step };
        let lastStepError: string | undefined;

        while (retryAttempt <= maxRetries) {
          try {
            result = await executeStep(browser, currentStep, screenshotDir, globalStepIndex);
            lastStepError = undefined;
            break;
          } catch (stepError) {
            const errorMsg = stepError instanceof Error ? stepError.message : String(stepError);
            lastStepError = errorMsg;

            const multiMatch = isMultipleMatchError(errorMsg);
            if (multiMatch.matched && currentStep.selector && retryAttempt < maxRetries) {
              retryAttempt++;
              const newSelector = makeFirstSelector(currentStep.selector);
              emit(onProgress, {
                type: "log",
                message: `Selector matched ${multiMatch.count} elements, retrying with: ${newSelector}`,
                level: "warn",
              });
              currentStep = { ...currentStep, selector: newSelector };
            } else {
              throw stepError;
            }
          }
        }

        if (lastStepError) {
          throw new Error(lastStepError);
        }
        executedStep.result = result;

        let stepScreenshotUrl: string | undefined;
        if (shouldScreenshotAfter(step.type, config.captureBeforeAfterScreenshots)) {
          const filename = `step-${String(screenshotCounter).padStart(2, "0")}-after.png`;
          const filepath = join(screenshotDir, filename);
          try {
            await browser.screenshot(filepath);
            screenshotMap[filepath] = globalStepIndex;
            stepScreenshotUrl = await saveAndEmitScreenshot(filepath, globalStepIndex, `After ${step.type}`);
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

        if (isBlockingError(errorMessage) || config.strictMode) {
          executedStep.status = "blocked";
          blocked = true;
        } else if (isSkippableError(errorMessage)) {
          emit(onProgress, { type: "log", message: `Step skipped: ${errorMessage}`, level: "warn" });
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

    const allAudits = [...runAudits, ...pageAudits];
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

    emitPhaseComplete(onProgress, "execution");

    // === Phase 4: Evaluation ===
    emitPhaseStart(onProgress, "evaluation");
    emit(onProgress, { type: "log", message: "Evaluating test results...", level: "info" });

    // Create evidence file path
    const evidenceFilePath = join(localStorage.getLocalStorageDir(), runId, "screenshots");

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
      audits: evidence.audits?.map((audit) => ({
        ...audit,
        screenshotPath: audit.screenshotPath
          ? screenshotUrlMap[audit.screenshotPath] || audit.screenshotPath
          : undefined,
      })),
      screenshotMap: Object.fromEntries(
        Object.entries(evidence.screenshotMap).map(([path, idx]) => [
          screenshotUrlMap[path] || path,
          idx,
        ])
      ),
    };

    // Save run results to local storage
    try {
      await localStorage.completeLocalRun(
        runId,
        reportWithUrls.score,
        reportWithUrls.summary,
        reportWithUrls,
        evidenceWithUrls
      );

      // Generate report.md and llm-fix.txt
      const reportMdPath = await localStorage.generateReportMarkdown(runId, reportWithUrls);
      const llmFixPath = await localStorage.generateLlmFixFile(runId, reportWithUrls);

      // Update report artifacts with the generated files
      reportWithUrls.artifacts.reportFile = reportMdPath;
      reportWithUrls.artifacts.llmFixFile = llmFixPath;

      emit(onProgress, {
        type: "log",
        message: `Results saved to ${localStorage.getLocalStorageDir()}/${runId}`,
        level: "info",
      });
      emit(onProgress, {
        type: "log",
        message: `Report: ${reportMdPath}`,
        level: "info",
      });
      emit(onProgress, {
        type: "log",
        message: `LLM Fix Guide: ${llmFixPath}`,
        level: "info",
      });
    } catch (error) {
      emit(onProgress, {
        type: "log",
        message: `Failed to save locally: ${error}`,
        level: "warn",
      });
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

    // Save failure status to local storage
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

    // Clean up temp directory
    try {
      const { rm } = await import("node:fs/promises");
      await rm(screenshotDir, { recursive: true, force: true });
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// Coverage-Guided Exploration (Experimental)
// ============================================================================

export interface CoverageGuidedOptions extends StreamingRunOptions {
  /** Use the coverage-guided exploration engine */
  useCoverageGuided: true;
}

/**
 * Run QA with coverage-guided exploration engine
 * This is an alternative to the traditional plan-based approach
 */
export async function runCoverageGuidedQA(
  options: CoverageGuidedOptions
): Promise<{ explorationResult: ExplorationResult; coverageStats: ReturnType<typeof import("./coverage.js").createCoverageTracker>["getStats"] }> {
  const { config, url, onProgress } = options;
  const timestamp = getTimestamp();

  emit(onProgress, { type: "log", message: "Starting coverage-guided exploration...", level: "info" });

  // Create trackers
  const stateTracker = createStateTracker();
  const budgetTracker = createBudgetTracker(config.budgetConfig);
  const coverageTracker = createCoverageTracker();

  // Create browser
  const browser = createAgentBrowser({
    timeout: config.browserTimeout,
    navigationTimeout: config.navigationTimeout,
    actionTimeout: config.actionTimeout,
    maxRetries: config.maxRetries,
    retryDelayMs: config.retryDelayMs,
    debug: process.env.DEBUG === "true",
  });

  try {
    // Open initial URL
    await browser.open(url);

    // Create explorer
    const explorer = createExplorer(browser, coverageTracker, stateTracker, budgetTracker, {
      strategy: config.explorationMode,
      beamWidth: config.beamWidth,
    });

    // Run exploration
    const explorationResult = await explorer.explore({
      onStart: () => {
        emit(onProgress, { type: "log", message: "Exploration started", level: "info" });
      },
      onBeforeAction: (action, stepIndex) => {
        emit(onProgress, {
          type: "log",
          message: `Step ${stepIndex + 1}: ${action.actionType} on "${action.element.text.slice(0, 30)}"`,
          level: "info",
        });
      },
      onAfterAction: (step) => {
        const gain = step.coverageGain.hasGain ? ` (+${step.coverageGain.totalGain} coverage)` : "";
        emit(onProgress, {
          type: "log",
          message: `Step ${step.index + 1} ${step.success ? "succeeded" : "failed"}${gain}`,
          level: step.success ? "info" : "warn",
        });
      },
      onComplete: (result) => {
        emit(onProgress, {
          type: "log",
          message: `Exploration complete: ${result.terminationReason}`,
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

    // Get coverage stats
    const coverageStats = coverageTracker.getStats();

    emit(onProgress, {
      type: "log",
      message: `Coverage score: ${coverageStats.coverageScore.toFixed(0)}/100`,
      level: "info",
    });
    emit(onProgress, {
      type: "log",
      message: `Unique states: ${explorationResult.uniqueStates}`,
      level: "info",
    });
    emit(onProgress, {
      type: "log",
      message: `Steps taken: ${explorationResult.steps.length}`,
      level: "info",
    });

    return {
      explorationResult,
      coverageStats: () => coverageStats,
    };
  } finally {
    await browser.close();
  }
}

// ============================================================================
// Auth Fixture Helpers
// ============================================================================

/**
 * Save the current browser auth state as a fixture
 */
export async function saveAuthFixture(
  browser: AgentBrowser,
  name: string,
  fixturesDir?: string
): Promise<ReturnType<typeof createAuthManager>["loadFixture"]> {
  const authManager = createAuthManager(fixturesDir);
  const fixture = await authManager.saveFixture(browser, name);
  return async () => fixture;
}

/**
 * Apply an auth fixture to the browser
 */
export async function applyAuthFixture(
  browser: AgentBrowser,
  fixtureIdOrName: string,
  fixturesDir?: string
): Promise<boolean> {
  const authManager = createAuthManager(fixturesDir);
  const fixture = await authManager.loadFixture(fixtureIdOrName);
  if (!fixture) {
    return false;
  }
  await authManager.applyFixture(browser, fixture);
  return true;
}
