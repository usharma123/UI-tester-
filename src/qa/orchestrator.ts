// =============================================================================
// Pipeline orchestrator: discover → analyze → execute → report
// =============================================================================

import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../config.js";
import type { TestScenario, TestResult, Report, Evidence, QAReport } from "./types.js";
import type { ProgressCallback } from "./progress-types.js";
import type { LLMClient } from "./llm.js";
import { createAgentBrowser } from "../agentBrowser.js";
import { createLLMClient } from "./llm.js";
import { capturePage, analyzeCapture } from "./analyzer.js";
import type { PageCapture } from "./analyzer.js";
import { runScenario } from "./agent.js";
import { generateReport } from "./reporter.js";
import { runDiscoveryPhase } from "./phases/discovery.js";
import { emit, emitPhaseStart, emitPhaseComplete } from "../core/events/emit.js";
import { ensureDir } from "../utils/fs.js";
import { getTimestamp } from "../utils/time.js";
import { createBrowserPool } from "../utils/browserPool.js";
import * as localStorage from "../storage/local.js";

export interface PipelineOptions {
  config: Config;
  url: string;
  goals?: string;
  runId: string;
  eventsFilePath?: string;
  onProgress: ProgressCallback;
}

export interface PipelineResult {
  report: Report;
  evidence: Evidence;
  qaReport: QAReport;
}

export async function runQAPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { config, url, goals, runId, eventsFilePath, onProgress } = options;
  const timestamp = getTimestamp();
  const screenshotDir = join(tmpdir(), `qa-screenshots-${timestamp}`);
  await ensureDir(screenshotDir);

  await localStorage.createLocalRun(runId, url, goals || config.goals);
  if (eventsFilePath) {
    await localStorage.setLocalRunEventsFile(runId, eventsFilePath);
  }

  const llm = createLLMClient(config);
  const screenshotUrlMap: Record<string, string> = {};

  // Create browser for discovery + analysis
  const browser = createAgentBrowser({
    timeout: config.browserTimeout,
    navigationTimeout: config.navigationTimeout,
    actionTimeout: config.actionTimeout,
    maxRetries: config.maxRetries,
    retryDelayMs: config.retryDelayMs,
    debug: process.env.DEBUG === "true",
    headless: config.headless,
  });

  try {
    // =========================================================================
    // Phase 1: DISCOVERY — find pages
    // =========================================================================
    const sitemap = await runDiscoveryPhase({ browser, config, url, onProgress });

    const pageUrls = sitemap.urls
      .slice(0, config.maxPages)
      .map((u) => u.loc);

    // =========================================================================
    // Phase 2: ANALYSIS — generate test scenarios for each page
    // =========================================================================
    emitPhaseStart(onProgress, "analysis");
    emit(onProgress, { type: "log", message: "Analyzing pages for test scenarios...", level: "info" });

    const allScenarios: TestScenario[] = [];

    // Phase 2a: Capture all pages sequentially with single browser (~1s each)
    const captures: PageCapture[] = [];
    for (let i = 0; i < pageUrls.length; i++) {
      const pageUrl = pageUrls[i];
      emit(onProgress, {
        type: "log",
        message: `Capturing page ${i + 1}/${pageUrls.length}: ${pageUrl}`,
        level: "info",
      });

      try {
        const capture = await capturePage({
          browser,
          url: pageUrl,
          screenshotDir,
          goals,
        });
        captures.push(capture);
      } catch (err) {
        emit(onProgress, {
          type: "log",
          message: `Failed to capture ${pageUrl}: ${err instanceof Error ? err.message : String(err)}`,
          level: "warn",
        });
      }
    }

    // Close browser early — no longer needed for LLM analysis
    try { await browser.close(); } catch { /* ignore */ }

    // Phase 2b: Fire all LLM analysis calls in parallel
    emit(onProgress, {
      type: "log",
      message: `Analyzing ${captures.length} pages in parallel...`,
      level: "info",
    });

    const analysisResults = await Promise.all(
      captures.map(async (capture) => {
        try {
          return await analyzeCapture({
            capture,
            llm,
            maxScenarios: config.maxScenariosPerPage,
          });
        } catch (err) {
          emit(onProgress, {
            type: "log",
            message: `Failed to analyze ${capture.url}: ${err instanceof Error ? err.message : String(err)}`,
            level: "warn",
          });
          return [];
        }
      })
    );

    for (const scenarios of analysisResults) {
      allScenarios.push(...scenarios);
    }

    // Deduplicate scenarios - global scenarios only run once, page scenarios run per-page
    const deduplicatedScenarios = deduplicateScenarios(allScenarios);
    const removedCount = allScenarios.length - deduplicatedScenarios.length;
    
    emit(onProgress, {
      type: "log",
      message: `Generated ${allScenarios.length} scenarios, deduplicated to ${deduplicatedScenarios.length} (removed ${removedCount} duplicates)`,
      level: "info",
    });

    emit(onProgress, {
      type: "scenarios_generated",
      totalScenarios: deduplicatedScenarios.length,
      totalPages: pageUrls.length,
      scenarios: deduplicatedScenarios.map(s => ({ id: s.id, title: s.title })),
    });

    emitPhaseComplete(onProgress, "analysis");
    
    // Use deduplicated scenarios for execution
    const scenariosToRun = deduplicatedScenarios;

    // =========================================================================
    // Phase 3: EXECUTION — run each scenario through agent loop
    // =========================================================================
    emitPhaseStart(onProgress, "execution");
    emit(onProgress, { type: "log", message: "Running test scenarios...", level: "info" });

    const results: TestResult[] = [];

    // Run scenarios — use browser pool for concurrency
    const concurrency = Math.min(config.parallelBrowsers, scenariosToRun.length);
    const pool = createBrowserPool(concurrency, {
      timeout: config.browserTimeout,
      navigationTimeout: config.navigationTimeout,
      actionTimeout: config.actionTimeout,
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
      debug: process.env.DEBUG === "true",
      headless: config.headless,
    });

    try {
      // All scenario promises start immediately; pool limits concurrency
      const scenarioPromises = scenariosToRun.map(async (scenario, globalIdx) => {
        const pooled = await pool.acquire();

        emit(onProgress, {
          type: "scenario_start",
          scenarioId: scenario.id,
          title: scenario.title,
          index: globalIdx,
          total: scenariosToRun.length,
        });

        try {
          const result = await runScenario({
            browser: pooled.browser,
            scenario,
            llm,
            screenshotDir,
            onStep: (step) => {
              const errorSuffix = step.error ? ` — ${step.error}` : "";
              emit(onProgress, {
                type: "log",
                message: `  [${scenario.id}] Step ${step.index}: ${step.action.type}${step.action.selector ? ` ${step.action.selector}` : ""} → ${step.success ? "OK" : "FAIL"}${errorSuffix}`,
                level: step.success ? "info" : "warn",
              });
            },
          });

          emit(onProgress, {
            type: "scenario_complete",
            scenarioId: scenario.id,
            status: result.status,
            index: globalIdx,
            total: scenariosToRun.length,
          });

          // Save screenshots
          for (const path of result.evidence.screenshots) {
            try {
              const { localPath } = await localStorage.saveLocalScreenshot(
                runId,
                path,
                result.steps.findIndex((s) => s.screenshotPath === path),
                `${scenario.id}`
              );
              screenshotUrlMap[path] = localPath;
            } catch {
              // Ignore screenshot save errors
            }
          }

          return result;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          emit(onProgress, {
            type: "scenario_complete",
            scenarioId: scenario.id,
            status: "error",
            index: globalIdx,
            total: scenariosToRun.length,
          });
          emit(onProgress, {
            type: "log",
            message: `  [${scenario.id}] Scenario error: ${errorMessage}`,
            level: "warn",
          });
          return {
            scenario,
            status: "error" as const,
            steps: [],
            summary: `Scenario failed: ${errorMessage}`,
            evidence: { screenshots: [] },
            durationMs: 0,
          } satisfies TestResult;
        } finally {
          pool.release(pooled.id);
        }
      });

      results.push(...await Promise.all(scenarioPromises));
    } finally {
      await pool.closeAll();
    }

    const passed = results.filter((r) => r.status === "pass").length;
    const failed = results.filter((r) => r.status === "fail").length;
    const errored = results.filter((r) => r.status === "error").length;
    emit(onProgress, {
      type: "log",
      message: `Scenarios complete: ${passed} passed, ${failed} failed, ${errored} errors`,
      level: "info",
    });

    emitPhaseComplete(onProgress, "execution");

    // =========================================================================
    // Phase 4: EVALUATION — generate report
    // =========================================================================
    emitPhaseStart(onProgress, "evaluation");
    emit(onProgress, { type: "log", message: "Generating QA report...", level: "info" });

    const evidenceFilePath = join(localStorage.getLocalStorageDir(), runId, "screenshots");
    const { report, qaReport } = await generateReport({
      url,
      results,
      llm,
      evidenceFilePath,
    });

    // Map screenshot paths
    report.artifacts.screenshots = report.artifacts.screenshots.map(
      (p) => screenshotUrlMap[p] || p
    );
    report.issues = report.issues.map((issue) => ({
      ...issue,
      evidence: issue.evidence.map((p) => screenshotUrlMap[p] || p),
    }));

    const evidence: Evidence = {
      scenarios: results,
      screenshotMap: screenshotUrlMap,
    };

    // Save results locally
    try {
      await localStorage.completeLocalRun(runId, report.score, report.summary, report, evidence);
      const reportMdPath = await localStorage.generateReportMarkdown(runId, report);
      const llmFixPath = await localStorage.generateLlmFixFile(runId, report);
      report.artifacts.reportFile = reportMdPath;
      report.artifacts.llmFixFile = llmFixPath;

      emit(onProgress, { type: "log", message: `Results: ${localStorage.getLocalStorageDir()}/${runId}`, level: "info" });
      emit(onProgress, { type: "log", message: `Report: ${reportMdPath}`, level: "info" });
    } catch (err) {
      emit(onProgress, {
        type: "log",
        message: `Failed to save locally: ${err}`,
        level: "warn",
      });
    }

    emitPhaseComplete(onProgress, "evaluation");

    return { report, evidence, qaReport };
  } finally {
    try { await browser.close(); } catch { /* ignore */ }
  }
}

/**
 * Deduplicate scenarios:
 * - Global scenarios (site-wide features) are only tested once
 * - Page-specific scenarios are kept for each page
 */
function deduplicateScenarios(scenarios: TestScenario[]): TestScenario[] {
  const seenGlobalIds = new Set<string>();
  const result: TestScenario[] = [];
  
  for (const scenario of scenarios) {
    // Normalize ID for comparison (handle slight variations)
    const normalizedId = normalizeScenarioId(scenario.id);
    
    if (scenario.scope === "global") {
      // Only keep first instance of global scenarios
      if (!seenGlobalIds.has(normalizedId)) {
        seenGlobalIds.add(normalizedId);
        result.push(scenario);
      }
    } else {
      // Keep all page-specific scenarios
      result.push(scenario);
    }
  }
  
  return result;
}

/**
 * Normalize scenario ID for deduplication
 * e.g., "theme-toggle-functionality" and "theme-toggle-test" -> "theme-toggle"
 */
function normalizeScenarioId(id: string): string {
  // Remove common suffixes
  return id
    .replace(/-functionality$/, "")
    .replace(/-test$/, "")
    .replace(/-check$/, "")
    .replace(/-validation$/, "")
    .replace(/-verification$/, "");
}
