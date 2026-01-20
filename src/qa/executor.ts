import { join } from "node:path";
import type { AgentBrowser } from "../agentBrowser.js";
import type { Plan, Step, Evidence, ExecutedStep, SnapshotEntry, ErrorEntry } from "./types.js";
import { ensureDir } from "../utils/fs.js";

export interface ExecutorOptions {
  screenshotDir: string;
  maxSteps: number;
}

function shouldSnapshotAfter(stepType: string): boolean {
  return ["click", "fill", "press"].includes(stepType);
}

function shouldScreenshotAfter(stepType: string): boolean {
  return ["click", "open"].includes(stepType);
}

export async function executePlan(
  browser: AgentBrowser,
  plan: Plan,
  options: ExecutorOptions
): Promise<Evidence> {
  await ensureDir(options.screenshotDir);

  const executedSteps: ExecutedStep[] = [];
  const snapshots: SnapshotEntry[] = [];
  const errors: ErrorEntry[] = [];
  const screenshotMap: Record<string, number> = {};

  let screenshotCounter = 0;
  let blocked = false;

  async function takeScreenshot(stepIndex: number, suffix: string = ""): Promise<string | undefined> {
    try {
      const filename = `step-${String(stepIndex).padStart(2, "0")}${suffix}.png`;
      const filepath = join(options.screenshotDir, filename);
      await browser.screenshot(filepath);
      screenshotMap[filepath] = stepIndex;
      screenshotCounter++;
      return filepath;
    } catch (error) {
      console.warn(`Failed to take screenshot at step ${stepIndex}:`, error);
      return undefined;
    }
  }

  async function takeSnapshot(stepIndex: number): Promise<string | undefined> {
    try {
      const content = await browser.snapshot();
      snapshots.push({ stepIndex, content });
      return content;
    } catch (error) {
      console.warn(`Failed to take snapshot at step ${stepIndex}:`, error);
      return undefined;
    }
  }

  const stepsToExecute = plan.steps.slice(0, options.maxSteps);

  for (let i = 0; i < stepsToExecute.length; i++) {
    if (blocked) break;

    const step = stepsToExecute[i];
    const executedStep: ExecutedStep = {
      index: i,
      step,
      status: "success",
      timestamp: Date.now(),
    };

    try {
      const result = await executeStep(browser, step, options.screenshotDir, i);
      executedStep.result = result;

      if (shouldSnapshotAfter(step.type)) {
        await takeSnapshot(i);
      }

      if (shouldScreenshotAfter(step.type)) {
        const screenshotPath = await takeScreenshot(i, "-after");
        executedStep.screenshotPath = screenshotPath;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      executedStep.status = "failed";
      executedStep.error = errorMessage;
      errors.push({ stepIndex: i, error: errorMessage });

      const errorScreenshot = await takeScreenshot(i, "-error");
      executedStep.screenshotPath = errorScreenshot;

      if (isBlockingError(errorMessage)) {
        executedStep.status = "blocked";
        blocked = true;
        console.error(`Execution blocked at step ${i}: ${errorMessage}`);
      }
    }

    executedSteps.push(executedStep);
  }

  return {
    plan,
    executedSteps,
    snapshots,
    errors,
    screenshotMap,
  };
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
