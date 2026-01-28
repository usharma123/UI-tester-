/**
 * Tests for Budget Management Module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { createBudgetTracker, DEFAULT_BUDGET_CONFIG, estimateBudget, formatBudgetStatus } from "../src/qa/budget.js";

describe("BudgetTracker", () => {
  it("should create with defaults and allow continuing", () => {
    const t = createBudgetTracker();
    assert.strictEqual(t.canContinue(), true);
    assert.strictEqual(t.getConfig().maxTotalSteps, DEFAULT_BUDGET_CONFIG.maxTotalSteps);
  });

  it("should stop when max steps reached", () => {
    const t = createBudgetTracker({ maxTotalSteps: 2 });
    t.recordStep(true);
    t.recordStep(true);
    assert.strictEqual(t.canContinue(), false);
    assert.strictEqual(t.getStatus().exhaustionReason, "max_steps_reached");
  });

  it("should stop when max states reached", () => {
    const t = createBudgetTracker({ maxUniqueStates: 2 });
    t.setUniqueStates(2);
    assert.strictEqual(t.canContinue(), false);
    assert.strictEqual(t.getStatus().exhaustionReason, "max_states_reached");
  });

  it("should detect stagnation", () => {
    const t = createBudgetTracker({ stagnationThreshold: 2 });
    t.recordStep(false);
    t.recordStep(false);
    assert.strictEqual(t.canContinue(), false);
    assert.strictEqual(t.getStatus().exhaustionReason, "stagnation_detected");
  });

  it("should reset stagnation on coverage gain", () => {
    const t = createBudgetTracker({ stagnationThreshold: 3, maxTotalSteps: 100 });
    t.recordStep(false);
    t.recordStep(false);
    t.recordStep(true);
    assert.strictEqual(t.getStatus().stepsSinceLastGain, 0);
    assert.strictEqual(t.canContinue(), true);
  });

  it("should stop when max depth reached", () => {
    const t = createBudgetTracker({ maxDepth: 1 });
    t.setDepth(1);
    assert.strictEqual(t.canContinue(), false);
  });

  it("should support manual stop", () => {
    const t = createBudgetTracker();
    t.stop("test");
    assert.strictEqual(t.canContinue(), false);
    assert.strictEqual(t.getStatus().exhaustionReason, "manual_stop");
  });

  it("should track remaining budget", () => {
    const t = createBudgetTracker({ maxTotalSteps: 10, maxUniqueStates: 5 });
    t.recordStep(true);
    t.setUniqueStates(2);
    assert.strictEqual(t.getRemaining("steps"), 9);
    assert.strictEqual(t.getRemaining("states"), 3);
  });

  it("should reset correctly", () => {
    const t = createBudgetTracker({ maxTotalSteps: 100 });
    t.recordStep(true);
    t.setDepth(5);
    t.reset();
    assert.strictEqual(t.getStatus().stepsUsed, 0);
    assert.strictEqual(t.getStatus().currentDepth, 0);
  });
});

describe("estimateBudget", () => {
  it("should estimate based on page count", () => {
    const b = estimateBudget(10, 5);
    assert.ok(b.maxTotalSteps! >= 100);
    assert.ok(b.maxUniqueStates! >= 30);
  });
});

describe("formatBudgetStatus", () => {
  it("should format status", () => {
    const t = createBudgetTracker();
    t.recordStep(true);
    const f = formatBudgetStatus(t.getStatus());
    assert.ok(f.includes("Steps:"));
    assert.ok(f.includes("Active"));
  });
});
