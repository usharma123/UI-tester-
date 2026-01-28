/**
 * Tests for Visual Heuristics Module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { createRouteId, countIssuesBySeverity, formatVisualAuditResult, type VisualIssue, type VisualAuditResult } from "../src/qa/visual.js";

describe("createRouteId", () => {
  it("should create route ID from URL", () => {
    const id = createRouteId("https://example.com/about/team");
    assert.ok(id.includes("about-team"));
    assert.ok(id.length > 10);
  });

  it("should handle root URL", () => {
    const id = createRouteId("https://example.com/");
    assert.ok(id.includes("home"));
  });
});

describe("countIssuesBySeverity", () => {
  it("should count issues by severity", () => {
    const issues: VisualIssue[] = [
      { type: "overlapping_clickables", severity: "high", message: "test" },
      { type: "clipped_text", severity: "high", message: "test" },
      { type: "small_tap_target", severity: "medium", message: "test" },
      { type: "horizontal_overflow", severity: "low", message: "test" },
    ];
    const counts = countIssuesBySeverity(issues);
    assert.strictEqual(counts.high, 2);
    assert.strictEqual(counts.medium, 1);
    assert.strictEqual(counts.low, 1);
  });
});

describe("formatVisualAuditResult", () => {
  it("should format audit result", () => {
    const result: VisualAuditResult = {
      pageUrl: "https://example.com",
      viewport: { width: 1280, height: 720 },
      issues: [{ type: "small_tap_target", severity: "medium", message: "Button too small" }],
      timestamp: Date.now(),
      durationMs: 150,
    };
    const f = formatVisualAuditResult(result);
    assert.ok(f.includes("https://example.com"));
    assert.ok(f.includes("1280x720"));
    assert.ok(f.includes("Issues found: 1"));
    assert.ok(f.includes("MEDIUM"));
  });
});
