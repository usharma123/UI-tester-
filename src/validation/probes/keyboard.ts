import { join } from "node:path";
import { emit } from "../../core/events/emit.js";
import type { ValidationProbeContext, ValidationProbeResult } from "./types.js";

interface FocusSnapshot {
  tag: string;
  role: string;
  id: string;
  name: string;
  text: string;
}

function formatFocusTarget(target: FocusSnapshot): string {
  const base = target.id || target.name || target.text || target.tag || "unknown";
  return target.role ? `${base} [${target.role}]` : base;
}

export async function runKeyboardProbe(context: ValidationProbeContext): Promise<ValidationProbeResult> {
  const { browser, url, screenshotDir, onProgress } = context;
  const evidence: string[] = [];

  emit(onProgress, {
    type: "log",
    message: "Running keyboard accessibility probe...",
    level: "info",
  });

  try {
    await browser.open(url);
    await browser.setViewportSize(1366, 900);
    await browser.waitForStability();

    const focusPath: string[] = [];
    for (let i = 0; i < 4; i++) {
      await browser.press("Tab");
      await browser.waitForStability();
      const active = await browser.evalJson<FocusSnapshot>(
        `(() => {
          const el = document.activeElement;
          if (!el) return { tag: "", role: "", id: "", name: "", text: "" };
          const element = el;
          const rawText = (element.textContent || "").trim().slice(0, 40);
          return {
            tag: element.tagName ? element.tagName.toLowerCase() : "",
            role: element.getAttribute ? (element.getAttribute("role") || "") : "",
            id: element.id || "",
            name: element.getAttribute ? (element.getAttribute("name") || "") : "",
            text: rawText
          };
        })()`
      );
      focusPath.push(formatFocusTarget(active));
    }

    await browser.press("Enter");
    await browser.waitForStability();
    await browser.press("Escape");
    await browser.waitForStability();

    const screenshotPath = join(screenshotDir, `probe-keyboard-${Date.now()}.png`);
    await browser.screenshot(screenshotPath);
    evidence.push(screenshotPath);

    const uniqueFocusTargets = new Set(focusPath.filter(Boolean));
    const status = uniqueFocusTargets.size >= 2 ? "pass" : "partial";
    const summary =
      status === "pass"
        ? `Keyboard probe observed ${uniqueFocusTargets.size} focus transitions via Tab/Enter/Escape.`
        : "Keyboard probe executed, but focus movement evidence was limited.";

    return {
      id: "probe-keyboard-navigation",
      kind: "keyboard",
      status,
      summary,
      evidence,
      coveredRequirementIds: ["REQ-018"],
      findings: focusPath.map((target, idx) => `Tab ${idx + 1}: ${target}`),
      metrics: {
        focusTargetsObserved: uniqueFocusTargets.size,
      },
    };
  } catch (error) {
    return {
      id: "probe-keyboard-navigation",
      kind: "keyboard",
      status: "error",
      summary: `Keyboard probe failed: ${error instanceof Error ? error.message : String(error)}`,
      evidence,
      coveredRequirementIds: ["REQ-018"],
    };
  }
}
