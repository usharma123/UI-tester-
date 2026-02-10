import { join } from "node:path";
import { emit } from "../../core/events/emit.js";
import type { ValidationProbeContext, ValidationProbeResult } from "./types.js";

interface AxeLikeViolation {
  id: string;
  impact?: string | null;
  description?: string;
  help?: string;
  nodes?: Array<{ target?: string[] }>;
}

interface AxeLikeResults {
  violations: AxeLikeViolation[];
}

export async function runAccessibilityProbe(context: ValidationProbeContext): Promise<ValidationProbeResult> {
  const { browser, url, screenshotDir, onProgress } = context;
  const evidence: string[] = [];

  emit(onProgress, {
    type: "log",
    message: "Running accessibility probe...",
    level: "info",
  });

  try {
    await browser.open(url);
    await browser.setViewportSize(1366, 900);
    await browser.waitForStability();

    const dynamicImport = new Function("modulePath", "return import(modulePath);") as (
      modulePath: string
    ) => Promise<unknown>;
    const axeModuleUnknown = await dynamicImport("@axe-core/playwright");
    const axeModule = axeModuleUnknown as {
      default: new (options: { page: unknown }) => {
        withTags(tags: string[]): {
          analyze(): Promise<AxeLikeResults>;
        };
      };
    };

    const page = await browser.getPlaywrightPage();
    const builder = new axeModule.default({ page });
    const results = await builder.withTags(["wcag2a", "wcag2aa"]).analyze();

    const violations = Array.isArray(results.violations) ? results.violations : [];
    const contrastViolations = violations.filter((v) => v.id === "color-contrast");
    const labelViolations = violations.filter((v) =>
      ["aria-input-field-name", "label", "form-field-multiple-labels", "button-name"].includes(v.id)
    );

    const screenshotPath = join(screenshotDir, `probe-accessibility-${Date.now()}.png`);
    await browser.screenshot(screenshotPath);
    evidence.push(screenshotPath);

    const totalCritical = violations.filter((v) => v.impact === "critical" || v.impact === "serious").length;
    const noContrastIssues = contrastViolations.length === 0;
    const noLabelIssues = labelViolations.length === 0;
    const status = noContrastIssues && noLabelIssues ? "pass" : totalCritical > 0 ? "fail" : "partial";

    return {
      id: "probe-accessibility-axe",
      kind: "accessibility",
      status,
      summary:
        status === "pass"
          ? "Accessibility probe found no WCAG A/AA contrast or label violations."
          : `Accessibility probe found ${violations.length} violation(s), including ${contrastViolations.length} contrast and ${labelViolations.length} labeling issue(s).`,
      evidence,
      coveredRequirementIds: ["REQ-017", "REQ-019"],
      metrics: {
        totalViolations: violations.length,
        contrastViolations: contrastViolations.length,
        labelViolations: labelViolations.length,
        seriousOrCriticalViolations: totalCritical,
      },
      findings: violations.slice(0, 8).map((v) => {
        const target = v.nodes?.[0]?.target?.[0];
        return `${v.id}${target ? ` on ${target}` : ""}`;
      }),
    };
  } catch (error) {
    return {
      id: "probe-accessibility-axe",
      kind: "accessibility",
      status: "error",
      summary: `Accessibility probe failed: ${error instanceof Error ? error.message : String(error)}`,
      evidence,
      coveredRequirementIds: ["REQ-017", "REQ-019"],
    };
  }
}
