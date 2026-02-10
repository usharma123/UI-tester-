import type { ProgressCallback } from "../../qa/progress-types.js";
import type { TestScenario, TestResult } from "../../qa/types.js";
import { emit, emitValidationPhaseStart, emitValidationPhaseComplete } from "../../core/events/emit.js";
import { createAgentBrowser } from "../../agentBrowser.js";
import { createLLMClient } from "../../qa/llm.js";
import { runScenario } from "../../qa/agent.js";
import type { Config } from "../../config.js";
import type { ValidationConfig } from "../types.js";
import type { TestExecutionSummary } from "../cross-validator.js";

export interface ExecutionPhaseOptions {
  config: ValidationConfig;
  qaConfig: Config;
  scenarios: TestScenario[];
  screenshotDir: string;
  onProgress: ProgressCallback;
  testExecution: TestExecutionSummary;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

function resolveScenarioTimeoutMs(config: ValidationConfig): number {
  const parsed = parseInt(process.env.SCENARIO_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  // Allow enough time for slower LLM/browser steps, but prevent one scenario from stalling the entire run.
  return Math.max(config.browserTimeout * 4, 180_000);
}

export async function runExecutionPhase(options: ExecutionPhaseOptions): Promise<TestResult[]> {
  const { config, qaConfig, scenarios, screenshotDir, onProgress, testExecution } = options;

  emitValidationPhaseStart(onProgress, "execution");
  emit(onProgress, {
    type: "log",
    message: `Executing ${scenarios.length} test scenarios...`,
    level: "info",
  });

  const llm = createLLMClient(qaConfig);
  const results: TestResult[] = [];
  const concurrency = Math.min(config.parallelBrowsers, scenarios.length);
  const scenarioTimeoutMs = resolveScenarioTimeoutMs(config);

  for (let batch = 0; batch < scenarios.length; batch += concurrency) {
    const batchScenarios = scenarios.slice(batch, batch + concurrency);

    const batchResults = await Promise.all(
      batchScenarios.map(async (scenario, idx) => {
        const browser = createAgentBrowser({
          timeout: config.browserTimeout,
          navigationTimeout: config.navigationTimeout,
          actionTimeout: config.actionTimeout,
          maxRetries: 3,
          retryDelayMs: 1000,
          debug: process.env.DEBUG === "true",
        });

        const globalIdx = batch + idx;
        emit(onProgress, {
          type: "log",
          message: `Running scenario ${globalIdx + 1}/${scenarios.length}: ${scenario.title}`,
          level: "info",
        });

        try {
          const result = await withTimeout(
            runScenario({
              browser,
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
            }),
            scenarioTimeoutMs,
            `Scenario ${globalIdx + 1}/${scenarios.length} (${scenario.id})`
          );

          // Feed results into testExecution summary for cross-validation
          testExecution.pagesVisited.push(scenario.startUrl);
          for (const step of result.steps) {
            testExecution.stepsExecuted.push({
              type: step.action.type,
              selector: step.action.selector,
              result: step.success ? "success" : `failed: ${step.error || "unknown"}`,
              screenshot: step.screenshotPath,
            });
          }
          testExecution.screenshots.push(...result.evidence.screenshots);
          if (result.status === "error" || result.status === "fail") {
            testExecution.errors.push(`${scenario.title}: ${result.summary}`);
          }

          // Push per-scenario summary for richer cross-validation
          testExecution.scenarioRuns.push({
            scenarioId: scenario.id,
            title: scenario.title,
            status: result.status,
            summary: result.summary,
            requirementIds: scenario.requirementIds ?? [],
            steps: result.steps.map((s) => ({
              action: `${s.action.type}${s.action.selector ? ` ${s.action.selector}` : ""}`,
              success: s.success,
              error: s.error,
            })),
          });

          emit(onProgress, {
            type: "log",
            message: `  Scenario ${globalIdx + 1} complete: ${result.status}`,
            level: result.status === "pass" ? "info" : "warn",
          });

          return result;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          testExecution.errors.push(`${scenario.title}: ${errorMsg}`);
          return {
            scenario,
            status: "error" as const,
            steps: [],
            summary: `Scenario failed: ${errorMsg}`,
            evidence: { screenshots: [] },
            durationMs: 0,
          } satisfies TestResult;
        } finally {
          try { await browser.close(); } catch { /* ignore */ }
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
    message: `Execution complete: ${passed} passed, ${failed} failed, ${errored} errors`,
    level: "info",
  });

  emitValidationPhaseComplete(onProgress, "execution");

  return results;
}
