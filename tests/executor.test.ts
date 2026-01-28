import { describe, it, expect, beforeEach, mock } from "bun:test";
import { executePlan } from "../src/qa/executor.js";
import type { AgentBrowser } from "../src/agentBrowser.js";
import type { Plan } from "../src/qa/types.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createMockBrowser(overrides: Partial<AgentBrowser> = {}): AgentBrowser {
  return {
    open: mock(async () => {}),
    snapshot: mock(async () => "<div>Mock snapshot @e1</div>"),
    click: mock(async () => {}),
    fill: mock(async () => {}),
    press: mock(async () => {}),
    hover: mock(async () => {}),
    getText: mock(async () => "Mock text"),
    screenshot: mock(async () => {}),
    eval: mock(async () => ""),
    evalJson: mock(async () => ({})) as AgentBrowser["evalJson"],
    getLinks: mock(async () => []),
    setViewportSize: mock(async () => {}),
    close: mock(async () => {}),
    checkActionability: mock(async () => ({ isActionable: true, issues: [], confidence: 1 })),
    waitForStability: mock(async () => ({ isStable: true, waitedMs: 0, reason: "stable" as const })),
    detectActionOutcome: mock(() => ({ type: "no_change" as const, details: "", success: true })),
    getCurrentUrl: mock(async () => "https://example.com"),
    takePageSnapshot: mock(async () => ({ url: "https://example.com", domHash: "hash", elementCount: 10, textLength: 100, dialogCount: 0, timestamp: Date.now() })),
    ...overrides,
  };
}

describe("executePlan", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "qa-test-"));
  });

  it("should execute a simple plan successfully", async () => {
    const browser = createMockBrowser();
    const plan: Plan = {
      url: "https://example.com",
      steps: [
        { type: "snapshot", note: "Capture state" },
        { type: "click", selector: "@e1", note: "Click button" },
      ],
    };

    const evidence = await executePlan(browser, plan, {
      screenshotDir: tempDir,
      maxSteps: 20,
    });

    expect(evidence.executedSteps).toHaveLength(2);
    expect(evidence.executedSteps[0].status).toBe("success");
    expect(evidence.executedSteps[1].status).toBe("success");
    expect(browser.snapshot).toHaveBeenCalled();
    expect(browser.click).toHaveBeenCalledWith("@e1");
  });

  it("should capture snapshots after click/fill/press", async () => {
    const browser = createMockBrowser();
    const plan: Plan = {
      url: "https://example.com",
      steps: [
        { type: "click", selector: "@e1" },
        { type: "fill", selector: "@e2", text: "test" },
        { type: "press", key: "Enter" },
      ],
    };

    const evidence = await executePlan(browser, plan, {
      screenshotDir: tempDir,
      maxSteps: 20,
    });

    expect(evidence.snapshots.length).toBeGreaterThanOrEqual(3);
  });

  it("should handle step failures gracefully", async () => {
    const browser = createMockBrowser({
      click: mock(async () => {
        throw new Error("Element not found");
      }),
    });

    const plan: Plan = {
      url: "https://example.com",
      steps: [
        { type: "snapshot" },
        { type: "click", selector: "@e1" },
        { type: "snapshot" },
      ],
    };

    const evidence = await executePlan(browser, plan, {
      screenshotDir: tempDir,
      maxSteps: 20,
    });

    expect(evidence.executedSteps).toHaveLength(3);
    expect(evidence.executedSteps[1].status).toBe("failed");
    expect(evidence.executedSteps[1].error).toContain("Element not found");
    expect(evidence.errors).toHaveLength(1);
  });

  it("should stop execution on blocking errors", async () => {
    const browser = createMockBrowser({
      click: mock(async () => {
        throw new Error("Browser timeout");
      }),
    });

    const plan: Plan = {
      url: "https://example.com",
      steps: [
        { type: "click", selector: "@e1" },
        { type: "snapshot" },
        { type: "snapshot" },
      ],
    };

    const evidence = await executePlan(browser, plan, {
      screenshotDir: tempDir,
      maxSteps: 20,
    });

    expect(evidence.executedSteps).toHaveLength(1);
    expect(evidence.executedSteps[0].status).toBe("blocked");
  });

  it("should respect maxSteps limit", async () => {
    const browser = createMockBrowser();
    const plan: Plan = {
      url: "https://example.com",
      steps: Array(10).fill({ type: "snapshot" }),
    };

    const evidence = await executePlan(browser, plan, {
      screenshotDir: tempDir,
      maxSteps: 5,
    });

    expect(evidence.executedSteps).toHaveLength(5);
  });

  it("should execute fill step correctly", async () => {
    const browser = createMockBrowser();
    const plan: Plan = {
      url: "https://example.com",
      steps: [{ type: "fill", selector: "#email", text: "test@example.com" }],
    };

    await executePlan(browser, plan, {
      screenshotDir: tempDir,
      maxSteps: 20,
    });

    expect(browser.fill).toHaveBeenCalledWith("#email", "test@example.com");
  });

  it("should execute press step correctly", async () => {
    const browser = createMockBrowser();
    const plan: Plan = {
      url: "https://example.com",
      steps: [{ type: "press", key: "Tab" }],
    };

    await executePlan(browser, plan, {
      screenshotDir: tempDir,
      maxSteps: 20,
    });

    expect(browser.press).toHaveBeenCalledWith("Tab");
  });

  it("should execute getText step correctly", async () => {
    const browser = createMockBrowser({
      getText: mock(async () => "Hello World"),
    });

    const plan: Plan = {
      url: "https://example.com",
      steps: [{ type: "getText", selector: "@e1" }],
    };

    const evidence = await executePlan(browser, plan, {
      screenshotDir: tempDir,
      maxSteps: 20,
    });

    expect(browser.getText).toHaveBeenCalledWith("@e1");
    expect(evidence.executedSteps[0].result).toContain("Hello World");
  });

  it("should fail on missing required fields", async () => {
    const browser = createMockBrowser();

    const planMissingSelector: Plan = {
      url: "https://example.com",
      steps: [{ type: "click" }],
    };

    const evidence = await executePlan(browser, planMissingSelector, {
      screenshotDir: tempDir,
      maxSteps: 20,
    });

    expect(evidence.executedSteps[0].status).toBe("failed");
    expect(evidence.executedSteps[0].error).toContain("requires selector");
  });

  it("should track screenshot paths in evidence", async () => {
    const browser = createMockBrowser();
    const plan: Plan = {
      url: "https://example.com",
      steps: [{ type: "click", selector: "@e1" }],
    };

    const evidence = await executePlan(browser, plan, {
      screenshotDir: tempDir,
      maxSteps: 20,
    });

    expect(Object.keys(evidence.screenshotMap).length).toBeGreaterThan(0);
  });
});
