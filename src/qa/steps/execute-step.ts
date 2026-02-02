import { join } from "node:path";
import type { AgentBrowser } from "../../agentBrowser.js";
import type { Step } from "../types.js";

export async function executeStep(
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
