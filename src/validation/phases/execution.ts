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
          const result = await runScenario({
            browser,
            scenario,
            llm,
            screenshotDir,
            onStep: (step) => {
              emit(onProgress, {
                type: "log",
                message: `  [${scenario.id}] Step ${step.index}: ${step.action.type}${step.action.selector ? ` ${step.action.selector}` : ""} → ${step.success ? "OK" : "FAIL"}`,
                level: step.success ? "info" : "warn",
              });
            },
          });

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
