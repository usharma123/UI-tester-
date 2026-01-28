/**
 * Main validation runner - orchestrates the 8-phase validation process
 */

import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  ValidationConfig,
  Requirement,
  Rubric,
  RequirementResult,
  TraceabilityReport,
  ValidationPhase,
} from "./types.js";
import type { ProgressCallback, SSEEvent } from "../qa/progress-types.js";
import type { Step } from "../qa/types.js";
import { parseDocument } from "./parsers/index.js";
import { extractRequirements } from "./extractor.js";
import { generateRubric } from "./rubric-generator.js";
import { crossValidate, type TestExecutionSummary } from "./cross-validator.js";
import {
  generateTraceabilityReport,
  saveTraceabilityReport,
  saveMarkdownSummary,
} from "./traceability.js";
import { createAgentBrowser, type AgentBrowser } from "../agentBrowser.js";
import { createBrowserPool } from "../utils/browserPool.js";
import {
  fetchSitemap,
  crawlSitemap,
  formatSitemapForPlanner,
  type SitemapResult,
} from "../utils/sitemap.js";
import { createPlan } from "../qa/planner.js";
import { testPagesInParallel, mergeParallelResults } from "../qa/parallelTester.js";
import { ensureDir } from "../utils/fs.js";
import { getTimestamp } from "../utils/time.js";
import * as localStorage from "../storage/local.js";

export interface ValidationRunOptions {
  config: ValidationConfig;
  onProgress: ProgressCallback;
}

export interface ValidationRunResult {
  report: TraceabilityReport;
  reportPath: string;
  markdownPath: string;
}

// Helper to emit events with timestamp
function emit(callback: ProgressCallback, event: Omit<SSEEvent, "timestamp">) {
  callback({ ...event, timestamp: Date.now() } as SSEEvent);
}

// Helper to emit validation phase events
function emitValidationPhaseStart(
  callback: ProgressCallback,
  phase: ValidationPhase
) {
  emit(callback, { type: "validation_phase_start", phase });
}

function emitValidationPhaseComplete(
  callback: ProgressCallback,
  phase: ValidationPhase
) {
  emit(callback, { type: "validation_phase_complete", phase });
}

/**
 * Run the full validation process
 */
export async function runValidation(
  options: ValidationRunOptions
): Promise<ValidationRunResult> {
  const { config, onProgress } = options;
  const timestamp = getTimestamp();
  const runId = `validation-${Date.now()}`;

  // Setup directories
  const screenshotDir = join(tmpdir(), `validation-screenshots-${timestamp}`);
  await ensureDir(screenshotDir);
  await ensureDir(config.outputDir);

  // Create local run record
  await localStorage.createLocalRun(runId, config.url, "validation");

  // Track test execution for cross-validation
  const testExecution: TestExecutionSummary = {
    pagesVisited: [],
    stepsExecuted: [],
    errors: [],
    screenshots: [],
  };

  let requirements: Requirement[] = [];
  let rubric: Rubric | null = null;
  let results: RequirementResult[] = [];

  try {
    // === Phase 1: Parsing ===
    emitValidationPhaseStart(onProgress, "parsing");
    emit(onProgress, {
      type: "log",
      message: `Parsing specification: ${config.specFile}`,
      level: "info",
    });

    const document = await parseDocument(config.specFile);
    emit(onProgress, {
      type: "log",
      message: `Parsed ${document.sections.length} sections from ${document.metadata.lineCount} lines`,
      level: "info",
    });

    emitValidationPhaseComplete(onProgress, "parsing");

    // === Phase 2: Extraction ===
    emitValidationPhaseStart(onProgress, "extraction");
    emit(onProgress, {
      type: "log",
      message: "Extracting requirements via LLM...",
      level: "info",
    });

    const extractionResult = await extractRequirements(
      document,
      config.openRouterApiKey,
      config.openRouterModel
    );
    requirements = extractionResult.requirements;

    emit(onProgress, {
      type: "requirements_extracted",
      requirements,
      totalCount: requirements.length,
    });
    emit(onProgress, {
      type: "log",
      message: `Extracted ${requirements.length} requirements`,
      level: "info",
    });

    emitValidationPhaseComplete(onProgress, "extraction");

    // === Phase 3: Rubric Generation ===
    emitValidationPhaseStart(onProgress, "rubric");
    emit(onProgress, {
      type: "log",
      message: "Generating test rubric...",
      level: "info",
    });

    const rubricResult = await generateRubric(
      requirements,
      config.openRouterApiKey,
      config.openRouterModel
    );
    rubric = rubricResult.rubric;

    emit(onProgress, {
      type: "rubric_generated",
      rubric,
    });
    emit(onProgress, {
      type: "log",
      message: `Generated rubric with ${rubric.criteria.length} criteria (max score: ${rubric.maxScore})`,
      level: "info",
    });

    emitValidationPhaseComplete(onProgress, "rubric");

    // === Phase 4: Discovery ===
    emitValidationPhaseStart(onProgress, "discovery");
    emit(onProgress, {
      type: "log",
      message: "Discovering site structure...",
      level: "info",
    });

    const browser = createAgentBrowser({
      timeout: config.browserTimeout,
      navigationTimeout: config.navigationTimeout,
      actionTimeout: config.actionTimeout,
      maxRetries: 3,
      retryDelayMs: 1000,
      debug: process.env.DEBUG === "true",
    });

    await browser.open(config.url);
    const initialSnapshot = await browser.snapshot();
    testExecution.pagesVisited.push(config.url);

    // Take initial screenshot
    const initialScreenshot = join(screenshotDir, "00-initial.png");
    await browser.screenshot(initialScreenshot);
    testExecution.screenshots.push(initialScreenshot);

    let sitemap: SitemapResult;
    try {
      sitemap = await fetchSitemap(config.url, 15000);
      if (sitemap.urls.length < 3) {
        const crawled = await crawlSitemap(browser, config.url, config.maxPages);
        if (crawled.urls.length > sitemap.urls.length) {
          sitemap = crawled;
        }
      }
    } catch {
      sitemap = { urls: [{ loc: config.url }], source: "none" };
    }

    emit(onProgress, {
      type: "sitemap",
      urls: sitemap.urls.map((u) => ({
        loc: u.loc,
        lastmod: u.lastmod,
        priority: u.priority,
      })),
      source: sitemap.source,
      totalPages: sitemap.urls.length,
    });

    emitValidationPhaseComplete(onProgress, "discovery");

    // === Phase 5: Planning ===
    emitValidationPhaseStart(onProgress, "planning");
    emit(onProgress, {
      type: "log",
      message: "Generating requirement-linked test plan...",
      level: "info",
    });

    // Build goals from requirements for planning
    const requirementGoals = requirements
      .filter((r) => r.testable && r.priority !== "wont")
      .map((r) => `${r.id}: ${r.summary}`)
      .join("; ");

    const sitemapContext = formatSitemapForPlanner(sitemap);
    const sitemapUrls = sitemap.urls.map((u) => u.loc);

    const { plan } = await createPlan(
      {
        openRouterApiKey: config.openRouterApiKey,
        openRouterModel: config.openRouterModel,
        maxSteps: 20,
        goals: requirementGoals,
        screenshotDir,
        reportDir: config.outputDir,
        browserTimeout: config.browserTimeout,
        navigationTimeout: config.navigationTimeout,
        actionTimeout: config.actionTimeout,
        maxRetries: 3,
        retryDelayMs: 1000,
        maxPages: config.maxPages,
        stepsPerPage: config.stepsPerPage,
        parallelBrowsers: config.parallelBrowsers,
        auditsEnabled: false,
        strictMode: false,
        captureBeforeAfterScreenshots: true,
        viewports: [{ label: "desktop", width: 1365, height: 768 }],
      },
      config.url,
      requirementGoals,
      initialSnapshot,
      sitemapContext,
      sitemapUrls
    );

    emit(onProgress, {
      type: "plan_created",
      plan,
      totalSteps: plan.steps.length,
    });

    emitValidationPhaseComplete(onProgress, "planning");

    // === Phase 6: Execution ===
    emitValidationPhaseStart(onProgress, "execution");
    emit(onProgress, {
      type: "log",
      message: `Executing ${plan.steps.length} test steps...`,
      level: "info",
    });

    const pagesToTest = sitemap.urls.slice(0, config.maxPages);

    // Create browser pool
    const browserPool = createBrowserPool(config.parallelBrowsers, {
      timeout: config.browserTimeout,
      navigationTimeout: config.navigationTimeout,
      actionTimeout: config.actionTimeout,
      maxRetries: 3,
      retryDelayMs: 1000,
      debug: process.env.DEBUG === "true",
    });

    const qaConfig = {
      openRouterApiKey: config.openRouterApiKey,
      openRouterModel: config.openRouterModel,
      maxSteps: 20,
      goals: requirementGoals,
      screenshotDir,
      reportDir: config.outputDir,
      browserTimeout: config.browserTimeout,
      navigationTimeout: config.navigationTimeout,
      actionTimeout: config.actionTimeout,
      maxRetries: 3,
      retryDelayMs: 1000,
      maxPages: config.maxPages,
      stepsPerPage: config.stepsPerPage,
      parallelBrowsers: config.parallelBrowsers,
      auditsEnabled: false,
      strictMode: false,
      captureBeforeAfterScreenshots: true,
      viewports: [{ label: "desktop", width: 1365, height: 768 }],
    };

    try {
      // Test pages in parallel - correct argument order: pages, pool, config, screenshotDir, callbacks
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
            // Collect step results from page
            for (const step of result.executedSteps) {
              testExecution.stepsExecuted.push({
                type: step.step.type,
                selector: step.step.selector,
                result: step.result || "",
                screenshot: step.screenshotUrl,
              });
            }
            // Collect screenshots
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
          onStepComplete: (pageIndex: number, stepIndex: number, status: "success" | "failed" | "blocked", result?: string, error?: string) => {
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
            // For validation, just return the local path
            return localPath;
          },
        }
      );

      // Merge results
      const merged = mergeParallelResults(parallelResults);
      emit(onProgress, {
        type: "log",
        message: `Executed ${merged.executedSteps.length} steps across ${testExecution.pagesVisited.length} pages`,
        level: "info",
      });
    } finally {
      await browserPool.closeAll();
    }

    await browser.close();

    emitValidationPhaseComplete(onProgress, "execution");

    // === Phase 7: Cross-Validation ===
    emitValidationPhaseStart(onProgress, "cross_validation");
    emit(onProgress, {
      type: "log",
      message: "Cross-validating results against requirements...",
      level: "info",
    });

    const crossValidationResult = await crossValidate(
      requirements,
      rubric.criteria,
      testExecution,
      config.openRouterApiKey,
      config.openRouterModel
    );
    results = crossValidationResult.results;

    // Emit individual requirement results
    for (let i = 0; i < results.length; i++) {
      emit(onProgress, {
        type: "requirement_validated",
        result: results[i],
        index: i,
        total: results.length,
      });
    }

    emitValidationPhaseComplete(onProgress, "cross_validation");

    // === Phase 8: Reporting ===
    emitValidationPhaseStart(onProgress, "reporting");
    emit(onProgress, {
      type: "log",
      message: "Generating traceability report...",
      level: "info",
    });

    const report = generateTraceabilityReport({
      specFile: config.specFile,
      url: config.url,
      requirements,
      rubric,
      results,
    });

    // Save reports
    const reportPath = await saveTraceabilityReport(report, config.outputDir);
    const markdownPath = await saveMarkdownSummary(report, config.outputDir);

    emit(onProgress, {
      type: "log",
      message: `Report saved to ${reportPath}`,
      level: "info",
    });

    emit(onProgress, {
      type: "validation_complete",
      report,
    });

    emitValidationPhaseComplete(onProgress, "reporting");

    return {
      report,
      reportPath,
      markdownPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(onProgress, {
      type: "validation_error",
      message,
    });
    throw error;
  }
}
