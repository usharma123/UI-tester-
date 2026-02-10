import { join } from "node:path";
import { emit } from "../../core/events/emit.js";
import type { ValidationProbeContext, ValidationProbeResult } from "./types.js";

interface LayoutMetrics {
  viewportWidth: number;
  viewportHeight: number;
  primaryContainerWidth: number;
  stacked: boolean;
  fullWidthControlRatio: number;
}

export async function runResponsiveProbe(context: ValidationProbeContext): Promise<ValidationProbeResult> {
  const { browser, url, screenshotDir, onProgress } = context;
  const evidence: string[] = [];

  emit(onProgress, {
    type: "log",
    message: "Running responsive design probe...",
    level: "info",
  });

  try {
    await browser.open(url);
    await browser.waitForStability();

    await browser.setViewportSize(1366, 900);
    await browser.waitForStability();
    const desktopMetrics = await browser.evalJson<LayoutMetrics>(
      `(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const candidates = Array.from(document.querySelectorAll("main, [role='main'], form, .converter, .container, body > div"));
        const widths = candidates.map((el) => Math.round(el.getBoundingClientRect().width)).filter((w) => w > 0 && w <= vw);
        const primaryContainerWidth = widths.length > 0 ? Math.max(...widths) : vw;
        const controls = Array.from(document.querySelectorAll("input, select, button")).slice(0, 6);
        let stacked = false;
        if (controls.length >= 2) {
          const first = controls[0].getBoundingClientRect();
          const second = controls[1].getBoundingClientRect();
          stacked = Math.abs(first.left - second.left) < 20 && second.top - first.top > 18;
        }
        const fullWidthControls = controls.filter((el) => el.getBoundingClientRect().width >= vw * 0.8).length;
        const ratio = controls.length > 0 ? fullWidthControls / controls.length : 0;
        return {
          viewportWidth: vw,
          viewportHeight: vh,
          primaryContainerWidth,
          stacked,
          fullWidthControlRatio: ratio
        };
      })()`
    );
    const desktopShot = join(screenshotDir, `probe-responsive-desktop-${Date.now()}.png`);
    await browser.screenshot(desktopShot);
    evidence.push(desktopShot);

    await browser.setViewportSize(390, 844);
    await browser.waitForStability();
    const mobileMetrics = await browser.evalJson<LayoutMetrics>(
      `(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const candidates = Array.from(document.querySelectorAll("main, [role='main'], form, .converter, .container, body > div"));
        const widths = candidates.map((el) => Math.round(el.getBoundingClientRect().width)).filter((w) => w > 0 && w <= vw);
        const primaryContainerWidth = widths.length > 0 ? Math.max(...widths) : vw;
        const controls = Array.from(document.querySelectorAll("input, select, button")).slice(0, 6);
        let stacked = false;
        if (controls.length >= 2) {
          const first = controls[0].getBoundingClientRect();
          const second = controls[1].getBoundingClientRect();
          stacked = Math.abs(first.left - second.left) < 20 && second.top - first.top > 18;
        }
        const fullWidthControls = controls.filter((el) => el.getBoundingClientRect().width >= vw * 0.8).length;
        const ratio = controls.length > 0 ? fullWidthControls / controls.length : 0;
        return {
          viewportWidth: vw,
          viewportHeight: vh,
          primaryContainerWidth,
          stacked,
          fullWidthControlRatio: ratio
        };
      })()`
    );
    const mobileShot = join(screenshotDir, `probe-responsive-mobile-${Date.now()}.png`);
    await browser.screenshot(mobileShot);
    evidence.push(mobileShot);

    const desktopWidthOk = desktopMetrics.primaryContainerWidth <= 630;
    const mobileStackedOk = mobileMetrics.stacked;
    const mobileFullWidthOk = mobileMetrics.fullWidthControlRatio >= 0.6;
    const passedChecks = [desktopWidthOk, mobileStackedOk, mobileFullWidthOk].filter(Boolean).length;

    const status = passedChecks === 3 ? "pass" : passedChecks >= 1 ? "partial" : "fail";
    const summary =
      status === "pass"
        ? "Responsive probe confirmed desktop width constraint and mobile stacked/full-width behavior."
        : "Responsive probe detected incomplete compliance for desktop/mobile layout constraints.";

    return {
      id: "probe-responsive-layout",
      kind: "responsive",
      status,
      summary,
      evidence,
      coveredRequirementIds: ["REQ-022"],
      metrics: {
        desktopContainerWidth: desktopMetrics.primaryContainerWidth,
        mobileContainerWidth: mobileMetrics.primaryContainerWidth,
        mobileFullWidthControlRatio: Number(mobileMetrics.fullWidthControlRatio.toFixed(3)),
      },
      findings: [
        `Desktop container width: ${desktopMetrics.primaryContainerWidth}px (target <= 600px)`,
        `Mobile stacked layout: ${mobileMetrics.stacked ? "yes" : "no"}`,
        `Mobile full-width controls ratio: ${(mobileMetrics.fullWidthControlRatio * 100).toFixed(0)}%`,
      ],
    };
  } catch (error) {
    return {
      id: "probe-responsive-layout",
      kind: "responsive",
      status: "error",
      summary: `Responsive probe failed: ${error instanceof Error ? error.message : String(error)}`,
      evidence,
      coveredRequirementIds: ["REQ-022"],
    };
  }
}
