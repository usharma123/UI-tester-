import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../config.js";
import type { Report, Evidence, ExecutedStep, SnapshotEntry, ErrorEntry, Step } from "./types.js";
import type { ProgressCallback, SSEEvent, QAPhase } from "../web/types.js";
import { createAgentBrowser, type AgentBrowser } from "../agentBrowser.js";
import { createPlan } from "./planner.js";
import { evaluateEvidence } from "./judge.js";
import { ensureDir } from "../utils/fs.js";
import { getTimestamp } from "../utils/time.js";
import { fetchSitemap, formatSitemapForPlanner, type SitemapResult } from "../utils/sitemap.js";
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

function isBlockingError(error: string): boolean {
  const blockingPatterns = [
    "timeout",
    "crashed",
    "disconnected",
    "navigation failed",
    "target closed",
    "session closed",
  ];

  const lowerError = error.toLowerCase();
  return blockingPatterns.some((pattern) => lowerError.includes(pattern));
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
      
      // If no pages found, use common paths fallback
      if (sitemap.urls.length === 0) {
        const baseUrl = url.replace(/\/$/, "");
        sitemap = {
          urls: [
            { loc: baseUrl },
            { loc: `${baseUrl}/about` },
            { loc: `${baseUrl}/pricing` },
            { loc: `${baseUrl}/features` },
            { loc: `${baseUrl}/contact` },
            { loc: `${baseUrl}/blog` },
            { loc: `${baseUrl}/docs` },
            { loc: `${baseUrl}/faq` },
            { loc: `${baseUrl}/terms` },
            { loc: `${baseUrl}/privacy` },
          ],
          source: "crawled",
        };
        emit(onProgress, {
          type: "log",
          message: "No sitemap found, using common page paths",
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
        message: `Found ${sitemap.urls.length} pages via ${sitemap.source}`,
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

    const { plan } = await createPlan(config, url, goals, initialSnapshot, sitemapContext);

    emit(onProgress, {
      type: "plan_created",
      plan,
      totalSteps: plan.steps.length,
    });

    emitPhaseComplete(onProgress, "planning");

    // === Phase 3: Execution ===
    emitPhaseStart(onProgress, "execution");

    const executedSteps: ExecutedStep[] = [];
    const snapshots: SnapshotEntry[] = [];
    const errors: ErrorEntry[] = [];
    const screenshotMap: Record<string, number> = {};
    let screenshotCounter = 1;
    let blocked = false;

    const stepsToExecute = plan.steps.slice(0, config.maxSteps);

    for (let i = 0; i < stepsToExecute.length; i++) {
      if (blocked) break;

      const step = stepsToExecute[i];

      emit(onProgress, {
        type: "step_start",
        stepIndex: i,
        step,
        totalSteps: stepsToExecute.length,
      });

      const executedStep: ExecutedStep = {
        index: i,
        step,
        status: "success",
        timestamp: Date.now(),
      };

      try {
        let result: string | undefined;
        let retryAttempt = 0;
        const maxRetries = 2;
        let currentStep = { ...step };
        let lastError: string | undefined;
        
        // Execution with retry for multiple-match errors
        while (retryAttempt <= maxRetries) {
          try {
            result = await executeStep(browser, currentStep, screenshotDir, i);
            lastError = undefined;
            break; // Success!
          } catch (stepError) {
            const errorMsg = stepError instanceof Error ? stepError.message : String(stepError);
            lastError = errorMsg;
            
            // Check if it's a multiple-match error that we can retry
            const multiMatch = isMultipleMatchError(errorMsg);
            if (multiMatch.matched && currentStep.selector && retryAttempt < maxRetries) {
              retryAttempt++;
              const newSelector = makeFirstSelector(currentStep.selector);
              
              emit(onProgress, {
                type: "log",
                message: `Selector matched ${multiMatch.count} elements, retrying with: ${newSelector}`,
                level: "warn",
              });
              
              // Update the step with more specific selector
              currentStep = { ...currentStep, selector: newSelector };
            } else {
              // Not a retryable error or max retries reached
              throw stepError;
            }
          }
        }
        
        if (lastError) {
          throw new Error(lastError);
        }
        
        executedStep.result = result;

        if (shouldSnapshotAfter(step.type)) {
          try {
            const snapshotContent = await browser.snapshot();
            snapshots.push({ stepIndex: i, content: snapshotContent });
          } catch (snapshotError) {
            emit(onProgress, {
              type: "log",
              message: `Failed to take snapshot at step ${i}: ${snapshotError}`,
              level: "warn",
            });
          }
        }

        let screenshotUrl: string | undefined;
        if (shouldScreenshotAfter(step.type)) {
          const filename = `step-${String(screenshotCounter).padStart(2, "0")}-after.png`;
          const filepath = join(screenshotDir, filename);
          try {
            await browser.screenshot(filepath);
            screenshotMap[filepath] = i;
            screenshotUrl = await uploadAndEmitScreenshot(filepath, i, `After ${step.type}`);
            executedStep.screenshotPath = filepath;
            screenshotCounter++;
          } catch (screenshotError) {
            emit(onProgress, {
              type: "log",
              message: `Failed to take screenshot at step ${i}: ${screenshotError}`,
              level: "warn",
            });
          }
        }

        emit(onProgress, {
          type: "step_complete",
          stepIndex: i,
          status: "success",
          result: executedStep.result,
          screenshotUrl,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        executedStep.status = "failed";
        executedStep.error = errorMessage;
        errors.push({ stepIndex: i, error: errorMessage });

        // Try to take error screenshot
        let screenshotUrl: string | undefined;
        try {
          const filename = `step-${String(screenshotCounter).padStart(2, "0")}-error.png`;
          const filepath = join(screenshotDir, filename);
          await browser.screenshot(filepath);
          screenshotMap[filepath] = i;
          screenshotUrl = await uploadAndEmitScreenshot(filepath, i, `Error at ${step.type}`);
          executedStep.screenshotPath = filepath;
          screenshotCounter++;
        } catch (screenshotError) {
          emit(onProgress, {
            type: "log",
            message: `Failed to take error screenshot at step ${i}: ${screenshotError}`,
            level: "warn",
          });
        }

        if (isBlockingError(errorMessage)) {
          executedStep.status = "blocked";
          blocked = true;
          emit(onProgress, {
            type: "log",
            message: `Execution blocked at step ${i}: ${errorMessage}`,
            level: "error",
          });
        }

        emit(onProgress, {
          type: "step_complete",
          stepIndex: i,
          status: executedStep.status,
          error: errorMessage,
          screenshotUrl,
        });
      }

      executedSteps.push(executedStep);
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
