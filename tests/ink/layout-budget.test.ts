import { describe, expect, test } from "bun:test";
import { computeViewportBudget } from "../../src/ink/layout/useViewportBudget.js";

describe("computeViewportBudget", () => {
  test("uses rich density at 40 rows", () => {
    const budget = computeViewportBudget(40, 120);
    expect(budget.density).toBe("rich");
    expect(budget.sectionHeights.logs).toBeGreaterThanOrEqual(6);
    expect(budget.visible.requirements).toBe(true);
    expect(budget.visible.sitemap).toBe(true);
    expect(budget.visible.scenarios).toBe(true);
  });

  test("uses standard density at 30 rows", () => {
    const budget = computeViewportBudget(30, 100);
    expect(budget.density).toBe("standard");
    expect(budget.sectionHeights.logs).toBeGreaterThanOrEqual(5);
    expect(budget.visible.sitemap).toBe(true);
    expect(budget.visible.scenarios).toBe(true);
  });

  test("uses compact density at 24 rows", () => {
    const budget = computeViewportBudget(24, 80);
    expect(budget.density).toBe("compact");
    expect(budget.sectionHeights.logs).toBeGreaterThanOrEqual(4);
    expect(budget.visible.scenarios).toBe(true);
  });

  test("uses minimal density below 24 rows", () => {
    const budget = computeViewportBudget(23, 80);
    expect(budget.density).toBe("minimal");
    expect(budget.visible.requirements).toBe(false);
    expect(budget.visible.scenarios).toBe(false);
    expect(budget.sectionHeights.logs).toBeGreaterThanOrEqual(3);
  });

  test("section heights are stable for a given terminal size", () => {
    const a = computeViewportBudget(40, 120);
    const b = computeViewportBudget(40, 120);
    expect(a.sectionHeights).toEqual(b.sectionHeights);
    expect(a.runningHeight).toBe(b.runningHeight);
  });

  test("logs grow with terminal height", () => {
    const small = computeViewportBudget(40, 120);
    const large = computeViewportBudget(60, 120);
    expect(large.sectionHeights.logs).toBeGreaterThan(small.sectionHeights.logs);
  });
});
