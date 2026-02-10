import { describe, expect, it } from "bun:test";
import type { AgentBrowser, PageSnapshot } from "../../src/agentBrowser.js";
import type { ValidationConfig } from "../../src/validation/types.js";
import { runKeyboardProbe } from "../../src/validation/probes/keyboard.js";
import { runResponsiveProbe } from "../../src/validation/probes/responsive.js";
import { runPerformanceProbe } from "../../src/validation/probes/performance.js";
import { runAccessibilityProbe } from "../../src/validation/probes/accessibility.js";
import { runValidationProbes } from "../../src/validation/probes/index.js";

const baseConfig: ValidationConfig = {
  specFile: "./requirements.md",
  url: "http://localhost:3000",
  outputDir: "./reports",
  openRouterApiKey: "test",
  openRouterModel: "test-model",
  maxPages: 10,
  maxScenariosPerPage: 8,
  maxStepsPerScenario: 14,
  parallelBrowsers: 2,
  browserTimeout: 60000,
  navigationTimeout: 45000,
  actionTimeout: 15000,
  gapRounds: 4,
  gapPagesPerRound: 3,
  maxTotalScenarios: 60,
  enableProbes: true,
  perfLoadBudgetMs: 2000,
  perfUiBudgetMs: 100,
};

function createMockBrowser(evalQueue: unknown[] = []): AgentBrowser {
  let evalIndex = 0;
  return {
    open: async () => {},
    snapshot: async () => "",
    click: async () => {},
    fill: async () => {},
    selectOption: async () => {},
    press: async () => {},
    hover: async () => {},
    getText: async () => "",
    screenshot: async () => {},
    eval: async () => "",
    evalJson: async <T>() => evalQueue[evalIndex++] as T,
    getPlaywrightPage: async () => ({}) as never,
    getLinks: async () => [],
    setViewportSize: async () => {},
    close: async () => {},
    getElementMeta: async () => null,
    checkActionability: async () => ({ isActionable: true, issues: [], confidence: 1 }),
    waitForStability: async () => ({ isStable: true, waitedMs: 0, reason: "stable" }),
    detectActionOutcome: () => ({ type: "no_change", details: "", success: true }),
    getCurrentUrl: async () => "http://localhost:3000",
    takePageSnapshot: async () =>
      ({
        url: "http://localhost:3000",
        domHash: "",
        visibleTextHash: "",
        interactiveStateHash: "",
        elementCount: 0,
        textLength: 0,
        dialogCount: 0,
        scrollX: 0,
        scrollY: 0,
        htmlClass: "",
        bodyClass: "",
        htmlDataTheme: "",
        bodyDataTheme: "",
        timestamp: Date.now(),
      }) satisfies PageSnapshot,
  };
}

describe("validation probes", () => {
  it("keyboard probe returns structured focus evidence", async () => {
    const browser = createMockBrowser([
      { tag: "button", role: "button", id: "a", name: "", text: "Swap" },
      { tag: "input", role: "", id: "amount", name: "amount", text: "" },
      { tag: "select", role: "combobox", id: "from", name: "", text: "" },
      { tag: "select", role: "combobox", id: "to", name: "", text: "" },
    ]);

    const result = await runKeyboardProbe({
      browser,
      url: "http://localhost:3000",
      screenshotDir: "/tmp",
      config: baseConfig,
      onProgress: () => {},
    });

    expect(result.kind).toBe("keyboard");
    expect(result.coveredRequirementIds).toContain("REQ-018");
    expect(result.status === "pass" || result.status === "partial" || result.status === "fail" || result.status === "error").toBe(true);
  });

  it("responsive probe captures desktop/mobile metrics", async () => {
    const browser = createMockBrowser([
      {
        viewportWidth: 1366,
        viewportHeight: 900,
        primaryContainerWidth: 600,
        stacked: false,
        fullWidthControlRatio: 0.1,
      },
      {
        viewportWidth: 390,
        viewportHeight: 844,
        primaryContainerWidth: 390,
        stacked: true,
        fullWidthControlRatio: 0.8,
      },
    ]);

    const result = await runResponsiveProbe({
      browser,
      url: "http://localhost:3000",
      screenshotDir: "/tmp",
      config: baseConfig,
      onProgress: () => {},
    });

    expect(result.kind).toBe("responsive");
    expect(result.coveredRequirementIds).toContain("REQ-022");
    expect(result.metrics?.desktopContainerWidth).toBe(600);
  });

  it("performance probe evaluates configured budgets", async () => {
    const browser = createMockBrowser([
      {
        loadTimeMs: 1200,
        uiLatencyMs: 40,
        rafAvgMs: 16,
      },
    ]);

    const result = await runPerformanceProbe({
      browser,
      url: "http://localhost:3000",
      screenshotDir: "/tmp",
      config: baseConfig,
      onProgress: () => {},
    });

    expect(result.kind).toBe("performance");
    expect(result.coveredRequirementIds).toEqual(["REQ-020", "REQ-021"]);
    expect(result.status).toBe("pass");
  });

  it("accessibility probe returns a typed result even when tooling is unavailable", async () => {
    const browser = createMockBrowser();
    const result = await runAccessibilityProbe({
      browser,
      url: "http://localhost:3000",
      screenshotDir: "/tmp",
      config: baseConfig,
      onProgress: () => {},
    });

    expect(result.kind).toBe("accessibility");
    expect(result.coveredRequirementIds).toEqual(["REQ-017", "REQ-019"]);
    expect(["pass", "partial", "fail", "error"]).toContain(result.status);
  });

  it("probe orchestrator short-circuits when probes are disabled", async () => {
    const browser = createMockBrowser();
    const results = await runValidationProbes({
      browser,
      url: "http://localhost:3000",
      screenshotDir: "/tmp",
      config: { ...baseConfig, enableProbes: false },
      onProgress: () => {},
    });

    expect(results).toEqual([]);
  });
});
