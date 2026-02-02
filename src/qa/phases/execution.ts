import { join } from "node:path";
import type { Config } from "../../config.js";
import type { AgentBrowser } from "../../agentBrowser.js";
import type { ProgressCallback } from "../progress-types.js";
import type { ExecutedStep, ErrorEntry, Plan, Step } from "../types.js";
import type { SitemapUrl } from "../../utils/sitemap.js";
import { emit, emitPhaseStart, emitPhaseComplete } from "../../core/events/emit.js";
import { executeStep } from "../steps/execute-step.js";
import { isBlockingError, isSkippableError, isMultipleMatchError } from "../steps/error-classifier.js";
import { shouldScreenshotAfter, shouldScreenshotBefore } from "../steps/screenshot-policy.js";
import { makeFirstSelector } from "../steps/selector-utils.js";

export interface ExecutionPhaseOptions {
  browser: AgentBrowser;
  config: Config;
  plan: Plan;
  pagesToTest: SitemapUrl[];
  screenshotDir: string;
  onProgress: ProgressCallback;
  saveAndEmitScreenshot: (localPath: string, stepIndex: number, label: string) => Promise<string>;
  startingStepIndex: number;
  startingScreenshotCounter: number;
  blocked: boolean;
}

export interface ExecutionPhaseResult {
  executedSteps: ExecutedStep[];
  errors: ErrorEntry[];
  screenshotMap: Record<string, number>;
  blocked: boolean;
  globalStepIndex: number;
  screenshotCounter: number;
}

export async function runExecutionPhase(options: ExecutionPhaseOptions): Promise<ExecutionPhaseResult> {
  const {
    browser,
    config,
    plan,
    pagesToTest,
    screenshotDir,
    onProgress,
    saveAndEmitScreenshot,
    startingStepIndex,
    startingScreenshotCounter,
  } = options;

  let blocked = options.blocked;
  let globalStepIndex = startingStepIndex;
  let screenshotCounter = startingScreenshotCounter;

  const executedSteps: ExecutedStep[] = [];
  const errors: ErrorEntry[] = [];
  const screenshotMap: Record<string, number> = {};

  emitPhaseStart(onProgress, "execution");
  emit(onProgress, { type: "log", message: "Executing additional planned tests...", level: "info" });

  const testedUrls = new Set(pagesToTest.map((p) => p.loc));
  const additionalSteps = plan.steps
    .filter((step) => {
      if (step.type === "open" && step.selector) {
        return !testedUrls.has(step.selector);
      }
      return step.type !== "open";
    })
    .slice(0, Math.max(0, config.maxSteps - globalStepIndex));

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
      let currentStep: Step = { ...step };
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
        emit(onProgress, { type: "log", message: `Step skipped: ${errorMessage}` , level: "warn" });
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

  emitPhaseComplete(onProgress, "execution");

  return {
    executedSteps,
    errors,
    screenshotMap,
    blocked,
    globalStepIndex,
    screenshotCounter,
  };
}
