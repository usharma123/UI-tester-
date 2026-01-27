import { join } from "node:path";
import type { Config } from "../config.js";
import type { AgentBrowser } from "../agentBrowser.js";
import type { BrowserPool } from "../utils/browserPool.js";
import type { SitemapUrl, PageStatus } from "./progress-types.js";
import type { Step, ExecutedStep, SnapshotEntry, ErrorEntry, AuditEntry } from "./types.js";
import { createPagePlan } from "./planner.js";
import { runDomAudit } from "./audits.js";

export interface PageTestResult {
  url: string;
  pageIndex: number;
  status: PageStatus;
  executedSteps: ExecutedStep[];
  snapshots: SnapshotEntry[];
  errors: ErrorEntry[];
  screenshotPaths: string[];
  screenshotUrl?: string;
  audits: AuditEntry[];
  stepsExecuted: number;
  error?: string;
}

export interface ParallelTestCallbacks {
  onPageStart: (url: string, pageIndex: number) => void;
  onPageComplete: (result: PageTestResult) => void;
  onStepStart: (pageIndex: number, stepIndex: number, step: Step, totalSteps: number) => void;
  onStepComplete: (pageIndex: number, stepIndex: number, status: "success" | "failed" | "blocked", result?: string, error?: string) => void;
  onLog: (message: string, level: "info" | "warn" | "error") => void;
  uploadScreenshot: (localPath: string, stepIndex: number, label: string) => Promise<string>;
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

// Check if error should block execution
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
  const cleanError = error.replace(/\x1b\[[0-9;]*m/g, "").replace(/\[[\d;]*m/g, "");
  const match = cleanError.match(/Selector "([^"]+)" matched (\d+) elements/);
  if (match) {
    return { matched: true, selector: match[1], count: parseInt(match[2], 10) };
  }
  return { matched: false };
}

function makeFirstSelector(selector: string): string {
  if (selector.startsWith("text=") || selector.startsWith("text:")) {
    return `${selector} >> nth=0`;
  }
  if (selector.startsWith("a:") || selector.includes(":has-text")) {
    return `${selector} >> nth=0`;
  }
  if (selector.includes(" ") || selector.includes(">")) {
    return `${selector}:first-of-type`;
  }
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

/**
 * Test a single page using the provided browser
 */
async function testSinglePage(
  browser: AgentBrowser,
  pageUrl: string,
  pageIndex: number,
  totalPages: number,
  config: Config,
  screenshotDir: string,
  startingStepIndex: number,
  callbacks: ParallelTestCallbacks
): Promise<PageTestResult> {
  const executedSteps: ExecutedStep[] = [];
  const snapshots: SnapshotEntry[] = [];
  const errors: ErrorEntry[] = [];
  const screenshotPaths: string[] = [];
  const audits: AuditEntry[] = [];
  let localStepIndex = startingStepIndex;
  let pageStatus: PageStatus = "success";
  let pageError: string | undefined;
  let pageScreenshotUrl: string | undefined;
  let stepsExecutedOnPage = 0;
  let blocked = false;

  try {
    // 1. Open the page
    await browser.open(pageUrl);

    const openStep: Step = { type: "open", selector: pageUrl, note: `Navigate to ${pageUrl}` };
    executedSteps.push({
      index: localStepIndex,
      step: openStep,
      status: "success",
      result: `Opened ${pageUrl}`,
      timestamp: Date.now(),
    });
    localStepIndex++;

    // 2. Take a screenshot of the page
    const pageScreenshotFilename = `page-${String(pageIndex).padStart(2, "0")}-${slugify(pageUrl)}.png`;
    const pageScreenshotPath = join(screenshotDir, pageScreenshotFilename);
    await browser.screenshot(pageScreenshotPath);
    screenshotPaths.push(pageScreenshotPath);
    pageScreenshotUrl = await callbacks.uploadScreenshot(pageScreenshotPath, localStepIndex, `Page: ${pageUrl}`);

    executedSteps.push({
      index: localStepIndex,
      step: { type: "screenshot", path: pageScreenshotPath, note: `Screenshot of ${pageUrl}` },
      status: "success",
      result: `Screenshot saved`,
      screenshotPath: pageScreenshotPath,
      timestamp: Date.now(),
    });
    localStepIndex++;

    // 3. Get page snapshot for planning
    const pageSnapshot = await browser.snapshot();
    snapshots.push({ stepIndex: localStepIndex - 1, content: pageSnapshot });

    if (config.auditsEnabled) {
      try {
        const audit = await runDomAudit(browser, pageUrl, "page");
        audits.push({ ...audit, screenshotPath: pageScreenshotPath });
      } catch (error) {
        callbacks.onLog(`[Page ${pageIndex}] Audit failed: ${error}`, "warn");
      }
    }

    // 4. Generate mini-plan for this page
    const { plan: pagePlan } = await createPagePlan(config, pageUrl, pageSnapshot, config.stepsPerPage);

    // 5. Execute mini-plan steps for this page
    for (let stepIdx = 0; stepIdx < pagePlan.steps.length; stepIdx++) {
      if (blocked) break;

      const step = pagePlan.steps[stepIdx];

      callbacks.onStepStart(pageIndex, localStepIndex, step, pagePlan.steps.length);

      const executedStep: ExecutedStep = {
        index: localStepIndex,
        step,
        status: "success",
        timestamp: Date.now(),
      };

      try {
        if (shouldScreenshotBefore(step.type, config.captureBeforeAfterScreenshots)) {
          const filename = `page-${String(pageIndex).padStart(2, "0")}-step-${String(stepIdx).padStart(2, "0")}-before.png`;
          const filepath = join(screenshotDir, filename);
          try {
            await browser.screenshot(filepath);
            screenshotPaths.push(filepath);
            await callbacks.uploadScreenshot(filepath, localStepIndex, `Before ${step.type}`);
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
            result = await executeStep(browser, currentStep, screenshotDir, localStepIndex);
            lastStepError = undefined;
            break;
          } catch (stepError) {
            const errorMsg = stepError instanceof Error ? stepError.message : String(stepError);
            lastStepError = errorMsg;

            const multiMatch = isMultipleMatchError(errorMsg);
            if (multiMatch.matched && currentStep.selector && retryAttempt < maxRetries) {
              retryAttempt++;
              const newSelector = makeFirstSelector(currentStep.selector);

              callbacks.onLog(
                `[Page ${pageIndex}] Selector matched ${multiMatch.count} elements, retrying with: ${newSelector}`,
                "warn"
              );

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
        stepsExecutedOnPage++;

        // Take snapshot after interactions
        if (shouldSnapshotAfter(step.type)) {
          try {
            const snapshotContent = await browser.snapshot();
            snapshots.push({ stepIndex: localStepIndex, content: snapshotContent });
          } catch {
            // Ignore snapshot errors
          }
        }

        // Take screenshot after clicks
        if (shouldScreenshotAfter(step.type, config.captureBeforeAfterScreenshots)) {
          const filename = `page-${String(pageIndex).padStart(2, "0")}-step-${String(stepIdx).padStart(2, "0")}-after.png`;
          const filepath = join(screenshotDir, filename);
          try {
            await browser.screenshot(filepath);
            screenshotPaths.push(filepath);
            await callbacks.uploadScreenshot(filepath, localStepIndex, `After ${step.type}`);
            executedStep.screenshotPath = filepath;
          } catch {
            // Ignore screenshot errors
          }
        }

        callbacks.onStepComplete(pageIndex, localStepIndex, "success", executedStep.result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        executedStep.status = "failed";
        executedStep.error = errorMessage;
        errors.push({ stepIndex: localStepIndex, error: errorMessage });

        if (isBlockingError(errorMessage) || config.strictMode) {
          executedStep.status = "blocked";
          blocked = true;
          callbacks.onLog(`[Page ${pageIndex}] Execution blocked: ${errorMessage}`, "error");
        } else if (isSkippableError(errorMessage)) {
          callbacks.onLog(`[Page ${pageIndex}] Step skipped: ${errorMessage}`, "warn");
        }

        callbacks.onStepComplete(pageIndex, localStepIndex, executedStep.status, undefined, errorMessage);
      }

      executedSteps.push(executedStep);
      localStepIndex++;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const blocking = isBlockingError(errorMessage) || config.strictMode;
    pageStatus = blocking ? "failed" : "skipped";
    pageError = errorMessage;

    if (blocking) {
      callbacks.onLog(`[Page ${pageIndex}] Execution blocked at ${pageUrl}: ${errorMessage}`, "error");
    } else {
      callbacks.onLog(`[Page ${pageIndex}] Skipping ${pageUrl}: ${errorMessage}`, "warn");
    }

    errors.push({ stepIndex: localStepIndex, error: `Page ${pageUrl}: ${errorMessage}` });
  }

  return {
    url: pageUrl,
    pageIndex,
    status: pageStatus,
    executedSteps,
    snapshots,
    errors,
    screenshotPaths,
    screenshotUrl: pageScreenshotUrl,
    audits,
    stepsExecuted: stepsExecutedOnPage,
    error: pageError,
  };
}

/**
 * Run tasks with bounded concurrency
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const executing: Promise<void>[] = [];
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const index = nextIndex++;
    if (index >= items.length) return;

    const item = items[index];
    results[index] = await fn(item, index);

    // Continue with next item
    await runNext();
  }

  // Start initial batch of concurrent tasks
  const initialBatch = Math.min(limit, items.length);
  for (let i = 0; i < initialBatch; i++) {
    executing.push(runNext());
  }

  await Promise.all(executing);
  return results;
}

/**
 * Test multiple pages in parallel using a browser pool
 */
export async function testPagesInParallel(
  pages: SitemapUrl[],
  pool: BrowserPool,
  config: Config,
  screenshotDir: string,
  callbacks: ParallelTestCallbacks
): Promise<PageTestResult[]> {
  const totalPages = pages.length;

  // Track step indices across all pages to ensure uniqueness
  // Each page gets a reserved range of step indices
  const stepsPerPageEstimate = config.stepsPerPage + 3; // +3 for open, screenshot, snapshot steps

  const results = await runWithConcurrency(
    pages,
    config.parallelBrowsers,
    async (page, pageIndex) => {
      callbacks.onPageStart(page.loc, pageIndex);

      // Acquire a browser from the pool
      const { browser, id: browserId } = await pool.acquire();

      try {
        // Calculate starting step index for this page
        const startingStepIndex = pageIndex * stepsPerPageEstimate;

        const result = await testSinglePage(
          browser,
          page.loc,
          pageIndex,
          totalPages,
          config,
          screenshotDir,
          startingStepIndex,
          callbacks
        );

        callbacks.onPageComplete(result);
        return result;
      } finally {
        // Always release the browser back to the pool
        pool.release(browserId);
      }
    }
  );

  return results;
}

/**
 * Merge results from parallel page testing into unified evidence arrays
 */
export function mergeParallelResults(results: PageTestResult[]): {
  executedSteps: ExecutedStep[];
  snapshots: SnapshotEntry[];
  errors: ErrorEntry[];
  screenshotMap: Record<string, number>;
  audits: AuditEntry[];
  pageProgress: { tested: number; skipped: number; failed: number };
} {
  const executedSteps: ExecutedStep[] = [];
  const snapshots: SnapshotEntry[] = [];
  const errors: ErrorEntry[] = [];
  const screenshotMap: Record<string, number> = {};
  const audits: AuditEntry[] = [];
  let tested = 0;
  let skipped = 0;
  let failed = 0;

  // Merge all results
  for (const result of results) {
    executedSteps.push(...result.executedSteps);
    snapshots.push(...result.snapshots);
    errors.push(...result.errors);
    audits.push(...result.audits);

    // Build screenshot map
    for (const step of result.executedSteps) {
      if (step.screenshotPath) {
        screenshotMap[step.screenshotPath] = step.index;
      }
    }
    for (const path of result.screenshotPaths) {
      if (!(path in screenshotMap)) {
        screenshotMap[path] = -1;
      }
    }

    // Track page status
    if (result.status === "success") {
      tested++;
    } else if (result.status === "skipped") {
      skipped++;
    } else {
      failed++;
    }
  }

  // Sort by step index to maintain order in report
  executedSteps.sort((a, b) => a.index - b.index);
  snapshots.sort((a, b) => a.stepIndex - b.stepIndex);
  errors.sort((a, b) => a.stepIndex - b.stepIndex);

  return {
    executedSteps,
    snapshots,
    errors,
    screenshotMap,
    audits,
    pageProgress: { tested, skipped, failed },
  };
}
