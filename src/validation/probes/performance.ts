import { join } from "node:path";
import { emit } from "../../core/events/emit.js";
import type { ValidationProbeContext, ValidationProbeResult } from "./types.js";

interface PerfMetrics {
  loadTimeMs: number;
  uiLatencyMs: number;
  rafAvgMs: number;
}

export async function runPerformanceProbe(context: ValidationProbeContext): Promise<ValidationProbeResult> {
  const { browser, url, screenshotDir, onProgress, config } = context;
  const evidence: string[] = [];

  emit(onProgress, {
    type: "log",
    message: "Running performance probe...",
    level: "info",
  });

  try {
    await browser.open(url);
    await browser.setViewportSize(1366, 900);
    await browser.waitForStability();

    const metrics = await browser.evalJson<PerfMetrics>(
      `(async () => {
        const nav = performance.getEntriesByType("navigation")[0];
        let loadTimeMs = nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : 0;
        if (!loadTimeMs && performance.timing) {
          const t = performance.timing;
          loadTimeMs = Math.max(0, t.loadEventEnd - t.navigationStart);
        }

        const rafSamples = [];
        let prev = performance.now();
        await new Promise((resolve) => {
          const frame = (ts) => {
            rafSamples.push(ts - prev);
            prev = ts;
            if (rafSamples.length >= 6) {
              resolve(undefined);
              return;
            }
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        const rafAvgMs = rafSamples.length ? rafSamples.reduce((a, b) => a + b, 0) / rafSamples.length : 0;

        const loopSamples = [];
        for (let i = 0; i < 4; i++) {
          const start = performance.now();
          await new Promise((resolve) => setTimeout(resolve, 0));
          loopSamples.push(performance.now() - start);
        }
        const uiLatencyMs = loopSamples.length ? loopSamples.reduce((a, b) => a + b, 0) / loopSamples.length : 0;

        return {
          loadTimeMs,
          uiLatencyMs,
          rafAvgMs
        };
      })()`
    );

    const screenshotPath = join(screenshotDir, `probe-performance-${Date.now()}.png`);
    await browser.screenshot(screenshotPath);
    evidence.push(screenshotPath);

    const loadOk = metrics.loadTimeMs > 0 && metrics.loadTimeMs <= config.perfLoadBudgetMs;
    const uiOk = metrics.uiLatencyMs > 0 && metrics.uiLatencyMs <= config.perfUiBudgetMs;
    const passedChecks = [loadOk, uiOk].filter(Boolean).length;
    const status = passedChecks === 2 ? "pass" : passedChecks === 1 ? "partial" : "fail";

    return {
      id: "probe-performance-budgets",
      kind: "performance",
      status,
      summary: `Performance probe measured load=${metrics.loadTimeMs.toFixed(1)}ms and ui=${metrics.uiLatencyMs.toFixed(1)}ms.`,
      evidence,
      coveredRequirementIds: ["REQ-020", "REQ-021"],
      metrics: {
        loadTimeMs: Number(metrics.loadTimeMs.toFixed(2)),
        uiLatencyMs: Number(metrics.uiLatencyMs.toFixed(2)),
        rafAvgMs: Number(metrics.rafAvgMs.toFixed(2)),
      },
      findings: [
        `Load time budget: ${config.perfLoadBudgetMs}ms; observed ${metrics.loadTimeMs.toFixed(1)}ms`,
        `UI latency budget: ${config.perfUiBudgetMs}ms; observed ${metrics.uiLatencyMs.toFixed(1)}ms`,
      ],
    };
  } catch (error) {
    return {
      id: "probe-performance-budgets",
      kind: "performance",
      status: "error",
      summary: `Performance probe failed: ${error instanceof Error ? error.message : String(error)}`,
      evidence,
      coveredRequirementIds: ["REQ-020", "REQ-021"],
    };
  }
}
