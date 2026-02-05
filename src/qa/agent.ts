// =============================================================================
// Core agent loop: See → Think → Act for a single test scenario
// =============================================================================

import { readFile } from "node:fs/promises";
import type { AgentBrowser } from "../agentBrowser.js";
import type { TestScenario, AgentAction, AgentStep, TestResult, TestStatus } from "./types.js";
import type { LLMClient, LLMMessage } from "./llm.js";
import { screenshotToContent, extractJson } from "./llm.js";
import { AGENT_SYSTEM_PROMPT, buildAgentPrompt } from "./prompts.js";

export interface RunScenarioOptions {
  browser: AgentBrowser;
  scenario: TestScenario;
  llm: LLMClient;
  screenshotDir: string;
  onStep?: (step: AgentStep) => void;
}

export async function runScenario(options: RunScenarioOptions): Promise<TestResult> {
  const { browser, scenario, llm, screenshotDir, onStep } = options;
  const startTime = Date.now();
  const steps: AgentStep[] = [];
  const screenshots: string[] = [];
  const history: Array<{ action: string; result: string }> = [];
  const parsedMaxFailures = parseInt(process.env.MAX_CONSECUTIVE_FAILURES ?? "", 10);
  const maxConsecutiveFailures =
    Number.isFinite(parsedMaxFailures) && parsedMaxFailures > 0 ? parsedMaxFailures : 2;
  let consecutiveFailures = 0;
  
  // Extract target domain for boundary enforcement
  const targetDomain = new URL(scenario.startUrl).hostname;

  // Navigate to starting URL
  await browser.open(scenario.startUrl);
  await browser.waitForStability();

  // Track successful actions for smart completion
  let successfulActions = 0;
  
  for (let i = 0; i < scenario.maxSteps; i++) {
    // 1. OBSERVE: screenshot + DOM snapshot
    const observationScreenshotPath = `${screenshotDir}/scenario-${scenario.id}-step-${i}-before.png`;
    await browser.screenshot(observationScreenshotPath);

    const domSnapshot = await browser.snapshot();

    // Read screenshot as base64 for vision
    let screenshotBase64: string;
    try {
      const buffer = await readFile(observationScreenshotPath);
      screenshotBase64 = buffer.toString("base64");
    } catch {
      screenshotBase64 = "";
    }
    
    // Smart completion: If we've had several successful actions and are near step limit,
    // encourage the agent to conclude
    const nearingLimit = i >= scenario.maxSteps - 2;
    const hasProgress = successfulActions >= 2;
    
    // 2. THINK: send to LLM
    const userPrompt = buildAgentPrompt(scenario, domSnapshot, history, i, scenario.maxSteps);
    
    // Add urgency hint if nearing limit with progress
    let finalPrompt = userPrompt;
    if (nearingLimit && hasProgress) {
      finalPrompt += `\n\nHINT: You've made ${successfulActions} successful actions. Consider concluding with "done" if the main test objective has been achieved.`;
    }
    
    const messages: LLMMessage[] = [
      { role: "system", content: AGENT_SYSTEM_PROMPT },
      {
        role: "user",
        content: screenshotBase64
          ? [
              screenshotToContent(screenshotBase64),
              { type: "text" as const, text: finalPrompt },
            ]
          : finalPrompt,
      },
    ];

    let action: AgentAction;
    try {
      const raw = await llm.chat(messages, { temperature: 0.1, maxTokens: 1024 });
      const json = extractJson(raw);
      action = JSON.parse(json) as AgentAction;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const step: AgentStep = {
        index: i,
        action: { type: "done", reasoning: `Failed to get LLM action: ${errorMessage}`, result: "fail" },
        success: false,
        error: `LLM error: ${errorMessage}`,
        screenshotPath: observationScreenshotPath,
        timestamp: Date.now(),
      };
      steps.push(step);
      onStep?.(step);
      screenshots.push(observationScreenshotPath);
      break;
    }

    // 3. ACT
    if (action.type === "done") {
      const step: AgentStep = {
        index: i,
        action,
        success: true,
        screenshotPath: observationScreenshotPath,
        timestamp: Date.now(),
      };
      steps.push(step);
      onStep?.(step);
      screenshots.push(observationScreenshotPath);

      return {
        scenario,
        status: action.result === "pass" ? "pass" : "fail",
        steps,
        summary: action.reasoning,
        evidence: { screenshots },
        durationMs: Date.now() - startTime,
      };
    }

    let success = true;
    let error: string | undefined;
    let stepScreenshotPath = observationScreenshotPath;
    let beforeSnapshot: Awaited<ReturnType<typeof browser.takePageSnapshot>> | null = null;
    let afterSnapshot: Awaited<ReturnType<typeof browser.takePageSnapshot>> | null = null;
    let clickMetaBefore: Awaited<ReturnType<typeof browser.getElementMeta>> | null = null;

    try {
      beforeSnapshot = await browser.takePageSnapshot();
    } catch {
      // Best-effort snapshot; don't fail the step
    }

    if (action.type === "click" && action.selector) {
      try {
        clickMetaBefore = await browser.getElementMeta(action.selector);
      } catch {
        clickMetaBefore = null;
      }
    }

    try {
      await executeAction(browser, action, targetDomain);
      await browser.waitForStability();
      try {
        afterSnapshot = await browser.takePageSnapshot();
      } catch {
        // Best-effort snapshot; don't fail the step
      }

      if (beforeSnapshot && afterSnapshot) {
        const outcome = browser.detectActionOutcome(beforeSnapshot, afterSnapshot);
        const shouldChange = action.type === "click" || action.type === "navigate" || action.type === "select";
        if (shouldChange && outcome.type === "no_change") {
          let allowNoChange = false;

          if (action.type === "click" && action.selector && clickMetaBefore) {
            const normalizeUrl = (url: string): string => {
              try {
                const parsed = new URL(url);
                parsed.hash = "";
                let result = parsed.toString();
                if (result.endsWith("/")) result = result.slice(0, -1);
                return result;
              } catch {
                return url.replace(/#.*$/, "").replace(/\/$/, "");
              }
            };

            if (clickMetaBefore.href && beforeSnapshot.url) {
              const targetUrl = normalizeUrl(clickMetaBefore.href);
              const currentUrl = normalizeUrl(beforeSnapshot.url);
              if (targetUrl === currentUrl) {
                allowNoChange = true;
              }
            }

            if (!allowNoChange) {
              try {
                const clickMetaAfter = await browser.getElementMeta(action.selector);
                if (clickMetaAfter) {
                  if (
                    clickMetaBefore.ariaExpanded !== clickMetaAfter.ariaExpanded ||
                    clickMetaBefore.ariaPressed !== clickMetaAfter.ariaPressed ||
                    clickMetaBefore.ariaChecked !== clickMetaAfter.ariaChecked ||
                    clickMetaBefore.dataState !== clickMetaAfter.dataState ||
                    clickMetaBefore.className !== clickMetaAfter.className
                  ) {
                    allowNoChange = true;
                  }
                }
              } catch {
                // ignore
              }
            }
          }

          if (!allowNoChange) {
            success = false;
            error = `No observable change after ${action.type}. ${outcome.details}`;
          }
        }
      }
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
    }

    try {
      const afterPath = `${screenshotDir}/scenario-${scenario.id}-step-${i}.png`;
      await browser.screenshot(afterPath);
      stepScreenshotPath = afterPath;
    } catch {
      // Keep observation screenshot as fallback
    }

    // 4. RECORD
    const step: AgentStep = {
      index: i,
      action,
      success,
      error,
      screenshotPath: stepScreenshotPath,
      timestamp: Date.now(),
    };
    steps.push(step);
    onStep?.(step);
    screenshots.push(stepScreenshotPath);

    const actionDesc = formatAction(action);
    history.push({
      action: actionDesc,
      result: success ? "success" : `failed: ${error ?? "unknown error"}`,
    });

    if (!success) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= maxConsecutiveFailures) {
        return {
          scenario,
          status: "fail",
          steps,
          summary: `Stopped after ${consecutiveFailures} consecutive failures: ${error ?? "unknown error"}`,
          evidence: { screenshots },
          durationMs: Date.now() - startTime,
        };
      }
    } else {
      consecutiveFailures = 0;
      // Track successful meaningful actions (not just waits/asserts)
      if (action.type !== "wait" && action.type !== "assert") {
        successfulActions += 1;
      }
    }
  }

  // Max steps reached
  return {
    scenario,
    status: "error",
    steps,
    summary: `Test did not complete within ${scenario.maxSteps} steps`,
    evidence: { screenshots },
    durationMs: Date.now() - startTime,
  };
}

async function executeAction(
  browser: AgentBrowser, 
  action: AgentAction,
  targetDomain: string
): Promise<void> {
  switch (action.type) {
    case "click":
      if (!action.selector) throw new Error("click requires a selector");
      // Check if clicking an external link - skip the click but don't fail
      try {
        const meta = await browser.getElementMeta(action.selector);
        if (meta?.href) {
          const linkDomain = new URL(meta.href).hostname;
          if (linkDomain !== targetDomain && !linkDomain.endsWith(`.${targetDomain}`)) {
            // External link - verify it exists but don't click
            return; // Success - link exists, we just don't navigate
          }
        }
      } catch {
        // Couldn't get meta, proceed with click
      }
      await browser.click(action.selector);
      break;
    case "fill":
      if (!action.selector) throw new Error("fill requires a selector");
      await browser.fill(action.selector, action.value ?? "");
      break;
    case "select":
      if (!action.selector) throw new Error("select requires a selector");
      if (!action.value) throw new Error("select requires a value");
      await browser.selectOption(action.selector, action.value);
      break;
    case "press":
      await browser.press(action.value ?? "Enter");
      break;
    case "hover":
      if (!action.selector) throw new Error("hover requires a selector");
      await browser.hover(action.selector);
      break;
    case "scroll":
      // Scroll up or down via keyboard
      await browser.press(action.value === "up" ? "PageUp" : "PageDown");
      break;
    case "navigate":
      if (!action.value) throw new Error("navigate requires a URL");
      // Enforce domain boundary
      try {
        const navigateDomain = new URL(action.value).hostname;
        if (navigateDomain !== targetDomain && !navigateDomain.endsWith(`.${targetDomain}`)) {
          throw new Error(`Cannot navigate to external domain: ${navigateDomain}. Stay on ${targetDomain}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("Cannot navigate")) {
          throw e;
        }
        // Invalid URL, let browser handle it
      }
      await browser.open(action.value);
      break;
    case "wait":
      // Just wait for stability (already done after each action)
      break;
    case "assert":
      // Assertions are evaluated by the LLM based on the next observation
      break;
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

function formatAction(action: AgentAction): string {
  switch (action.type) {
    case "click":
      return `click(${action.selector})`;
    case "fill":
      return `fill(${action.selector}, "${action.value}")`;
    case "select":
      return `select(${action.selector}, "${action.value}")`;
    case "press":
      return `press(${action.value})`;
    case "hover":
      return `hover(${action.selector})`;
    case "scroll":
      return `scroll(${action.value})`;
    case "navigate":
      return `navigate(${action.value})`;
    case "wait":
      return `wait(${action.value})`;
    case "assert":
      return `assert(${action.value})`;
    default:
      return action.type;
  }
}
