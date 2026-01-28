/**
 * Tests for Coverage Tracking Module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { createCoverageTracker, getCoverageRecommendations, formatCoverageStats } from "../src/qa/coverage.js";

describe("CoverageTracker", () => {
  it("should record URLs and deduplicate", () => {
    const t = createCoverageTracker();
    assert.strictEqual(t.recordUrl("https://example.com/a"), true);
    assert.strictEqual(t.recordUrl("https://example.com/a"), false);
    assert.strictEqual(t.recordUrl("https://example.com/b"), true);
    assert.strictEqual(t.getStats().totalUrls, 2);
  });

  it("should record forms, dialogs, elements", () => {
    const t = createCoverageTracker();
    t.recordForm("f1");
    t.recordDialog("d1");
    t.recordElementInteraction("btn");
    assert.strictEqual(t.getStats().totalForms, 1);
    assert.strictEqual(t.getStats().totalDialogs, 1);
    assert.strictEqual(t.getStats().totalInteractions, 1);
  });

  it("should calculate coverage gain", () => {
    const t = createCoverageTracker();
    t.recordUrl("https://example.com/a");
    const snap = t.takeSnapshot(0);
    t.recordUrl("https://example.com/b");
    t.recordForm("f1");
    const gain = t.calculateGain(snap);
    assert.strictEqual(gain.hasGain, true);
    assert.strictEqual(gain.newUrls.length, 1);
    assert.strictEqual(gain.newForms.length, 1);
  });

  it("should track action outcomes and effectiveness", () => {
    const t = createCoverageTracker();
    t.recordActionOutcome({ action: { type: "click" }, coverageGain: { totalGain: 5, hasGain: true, newUrls: [], newDialogs: [], newForms: [], newNetworkRequests: [], newConsoleErrors: [], newElements: [] }, stepIndex: 0, timestamp: Date.now() });
    t.recordActionOutcome({ action: { type: "click" }, coverageGain: { totalGain: 3, hasGain: true, newUrls: [], newDialogs: [], newForms: [], newNetworkRequests: [], newConsoleErrors: [], newElements: [] }, stepIndex: 1, timestamp: Date.now() });
    const eff = t.getMostEffectiveActionTypes();
    assert.strictEqual(eff[0].type, "click");
    assert.strictEqual(eff[0].avgGain, 4);
  });

  it("should reset", () => {
    const t = createCoverageTracker();
    t.recordUrl("https://example.com");
    t.reset();
    assert.strictEqual(t.getStats().totalUrls, 0);
  });
});

describe("getCoverageRecommendations", () => {
  it("should recommend exploring forms", () => {
    const t = createCoverageTracker();
    t.recordForm("f1");
    const recs = getCoverageRecommendations(t);
    assert.ok(recs.some(r => r.type === "explore_forms"));
  });
});

describe("formatCoverageStats", () => {
  it("should format stats", () => {
    const t = createCoverageTracker();
    t.recordUrl("https://example.com");
    const f = formatCoverageStats(t.getStats());
    assert.ok(f.includes("URLs: 1"));
  });
});
