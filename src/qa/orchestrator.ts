// =============================================================================
// Pipeline orchestrator: discover → analyze → execute → report
// =============================================================================

import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../config.js";
import type { AgentBrowser } from "../agentBrowser.js";
import type { TestScenario, TestResult, Report, Evidence, QAReport } from "./types.js";
import type { ProgressCallback } from "./progress-types.js";
import type { LLMClient } from "./llm.js";
import type { SitemapResult } from "../utils/sitemap.js";
import { createAgentBrowser } from "../agentBrowser.js";
import { createLLMClient } from "./llm.js";
import { analyzePage } from "./analyzer.js";
import { runScenario } from "./agent.js";
import { generateReport } from "./reporter.js";
import { runDiscoveryPhase } from "./phases/discovery.js";
import { emit, emitPhaseStart, emitPhaseComplete } from "../core/events/emit.js";
import { ensureDir } from "../utils/fs.js";
import { getTimestamp } from "../utils/time.js";
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

    for (let i = 0; i < pageUrls.length; i++) {
      const pageUrl = pageUrls[i];
      emit(onProgress, {
        type: "log",
        message: `Analyzing page ${i + 1}/${pageUrls.length}: ${pageUrl}`,
        level: "info",
      });

      try {
        const scenarios = await analyzePage({
          browser,
          url: pageUrl,
          llm,
          screenshotDir,
          maxScenarios: config.maxScenariosPerPage,
          goals,
        });
        allScenarios.push(...scenarios);
      } catch (err) {
        emit(onProgress, {
          type: "log",
          message: `Failed to analyze ${pageUrl}: ${err instanceof Error ? err.message : String(err)}`,
          level: "warn",
        });
      }
    }

    emit(onProgress, {
      type: "log",
      message: `Generated ${allScenarios.length} test scenarios across ${pageUrls.length} pages`,
      level: "info",
    });

    emit(onProgress, {
      type: "scenarios_generated",
      totalScenarios: allScenarios.length,
      totalPages: pageUrls.length,
    } as any);

    emitPhaseComplete(onProgress, "analysis");

    // =========================================================================
    // Phase 3: EXECUTION — run each scenario through agent loop
    // =========================================================================
    emitPhaseStart(onProgress, "execution");
    emit(onProgress, { type: "log", message: "Running test scenarios...", level: "info" });

    const results: TestResult[] = [];
    const scenarioBrowsers: AgentBrowser[] = [];

    // Run scenarios — use parallel browsers for concurrency
    const concurrency = Math.min(config.parallelBrowsers, allScenarios.length);

    // Simple batched execution
    for (let batch = 0; batch < allScenarios.length; batch += concurrency) {
      const batchScenarios = allScenarios.slice(batch, batch + concurrency);

      const batchResults = await Promise.all(
        batchScenarios.map(async (scenario, idx) => {
          const scenarioBrowser = createAgentBrowser({
            timeout: config.browserTimeout,
            navigationTimeout: config.navigationTimeout,
            actionTimeout: config.actionTimeout,
            maxRetries: config.maxRetries,
            retryDelayMs: config.retryDelayMs,
            debug: process.env.DEBUG === "true",
            headless: config.headless,
          });
          scenarioBrowsers.push(scenarioBrowser);

          const globalIdx = batch + idx;
          emit(onProgress, {
            type: "scenario_start",
            scenarioId: scenario.id,
            title: scenario.title,
            index: globalIdx,
            total: allScenarios.length,
          } as any);

          try {
            const result = await runScenario({
              browser: scenarioBrowser,
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
              total: allScenarios.length,
            } as any);

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
              total: allScenarios.length,
            } as any);
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
            try { await scenarioBrowser.close(); } catch { /* ignore */ }
          }
        })
      );

      results.push(...batchResults);
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
