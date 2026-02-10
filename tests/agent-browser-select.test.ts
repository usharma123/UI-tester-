import { describe, it, expect } from "bun:test";
import { buildCustomSelectFallbackSelectors } from "../src/agentBrowser.js";

/**
 * Placeholder tests for the selectOption cascade strategy.
 * These require a real browser instance, so they are integration tests
 * that would run in a CI environment with Playwright browsers installed.
 */
describe("selectOption cascade strategy", () => {
  it("builds nth-of-type custom dropdown fallback selectors", () => {
    const selectors = buildCustomSelectFallbackSelectors("select:nth-of-type(2)");

    expect(selectors).toContain("select:nth-of-type(2)");
    expect(selectors).toContain("[role='combobox']:nth-of-type(2)");
    expect(selectors).toContain("[aria-haspopup='listbox']:nth-of-type(2)");
    expect(selectors).toContain("button:nth-of-type(2)");
    expect(selectors).toContain("[role='combobox']");
    expect(selectors).toContain("[aria-haspopup='listbox']");
    expect(selectors).toContain("button[aria-haspopup='listbox']");
  });

  it("keeps custom selector first and deduplicates", () => {
    const selectors = buildCustomSelectFallbackSelectors("[role='combobox']");

    expect(selectors[0]).toBe("[role='combobox']");
    const unique = new Set(selectors);
    expect(unique.size).toBe(selectors.length);
  });

  it("includes generic fallback selectors for non-nth selectors", () => {
    const selectors = buildCustomSelectFallbackSelectors("div.currency-trigger");

    expect(selectors).toContain("div.currency-trigger");
    expect(selectors).toContain("[role='combobox']");
    expect(selectors).toContain("[aria-haspopup='listbox']");
    expect(selectors).toContain("button[aria-haspopup='listbox']");
  });
});
