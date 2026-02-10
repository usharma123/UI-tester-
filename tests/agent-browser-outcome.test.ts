import { describe, it, expect, afterAll } from "bun:test";
import type { PageSnapshot } from "../src/agentBrowser.js";
import { createAgentBrowser } from "../src/agentBrowser.js";

function makeSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: "https://example.com",
    domHash: "abc123",
    visibleTextHash: "text-hash-1",
    interactiveStateHash: "state-hash-1",
    elementCount: 100,
    textLength: 5000,
    dialogCount: 0,
    scrollX: 0,
    scrollY: 0,
    htmlClass: "",
    bodyClass: "",
    htmlDataTheme: "",
    bodyDataTheme: "",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("detectActionOutcome", () => {
  // Create a browser instance just to access detectActionOutcome
  const browser = createAgentBrowser({ headless: true });

  it("should detect URL change as success", () => {
    const before = makeSnapshot({ url: "https://example.com/page1" });
    const after = makeSnapshot({ url: "https://example.com/page2" });
    const result = browser.detectActionOutcome(before, after);
    expect(result.type).toBe("url_changed");
    expect(result.success).toBe(true);
  });

  it("should detect dialog opened as success", () => {
    const before = makeSnapshot({ dialogCount: 0 });
    const after = makeSnapshot({ dialogCount: 1 });
    const result = browser.detectActionOutcome(before, after);
    expect(result.type).toBe("dialog_opened");
    expect(result.success).toBe(true);
  });

  it("should detect DOM hash change as success", () => {
    const before = makeSnapshot({ domHash: "hash-a" });
    const after = makeSnapshot({ domHash: "hash-b" });
    const result = browser.detectActionOutcome(before, after);
    expect(result.type).toBe("dom_changed");
    expect(result.success).toBe(true);
  });

  it("should detect visible text hash change as success", () => {
    const before = makeSnapshot();
    const after = makeSnapshot({ visibleTextHash: "different-text-hash" });
    const result = browser.detectActionOutcome(before, after);
    expect(result.type).toBe("dom_changed");
    expect(result.success).toBe(true);
    expect(result.details).toContain("Visible text content changed");
  });

  it("should detect interactive state hash change as success", () => {
    const before = makeSnapshot();
    const after = makeSnapshot({ interactiveStateHash: "different-state-hash" });
    const result = browser.detectActionOutcome(before, after);
    expect(result.type).toBe("dom_changed");
    expect(result.success).toBe(true);
    expect(result.details).toContain("Form control state changed");
  });

  it("should return no_change when nothing changed", () => {
    const before = makeSnapshot();
    const after = makeSnapshot();
    const result = browser.detectActionOutcome(before, after);
    expect(result.type).toBe("no_change");
    expect(result.success).toBe(false);
  });

  it("should prioritize URL change over other changes", () => {
    const before = makeSnapshot({ url: "https://example.com/a" });
    const after = makeSnapshot({
      url: "https://example.com/b",
      domHash: "different",
      visibleTextHash: "different",
      interactiveStateHash: "different",
    });
    const result = browser.detectActionOutcome(before, after);
    expect(result.type).toBe("url_changed");
  });

  // Clean up browser (don't actually launch it)
  // The browser was never opened so close() is a no-op
  afterAll(async () => {
    await browser.close().catch(() => {});
  });
});
