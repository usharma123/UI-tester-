import { describe, expect, test } from "bun:test";
import React from "react";
import { AppRunningView, QA_RUNNING_HINTS } from "../../src/ink/App.js";
import { computeViewportBudget } from "../../src/ink/layout/useViewportBudget.js";
import { initialState } from "../../src/ink/types.js";

function collectSignature(node: React.ReactNode, out: Array<string> = []): Array<string> {
  if (Array.isArray(node)) {
    for (const child of node) collectSignature(child, out);
    return out;
  }
  if (!React.isValidElement(node)) return out;

  if (typeof node.type === "function") {
    const name = node.type.name || "Anonymous";
    if ("maxHeight" in (node.props as Record<string, unknown>)) {
      out.push(`${name}(maxHeight=${String((node.props as { maxHeight: unknown }).maxHeight)})`);
    } else {
      out.push(name);
    }
  }

  collectSignature((node.props as { children?: React.ReactNode }).children, out);
  return out;
}

describe("AppRunningView", () => {
  const runningState = {
    ...initialState,
    mode: "running" as const,
    currentPhase: "execution" as const,
    completedPhases: ["discovery", "analysis"] as const,
    sitemap: [{ loc: "https://example.com", priority: 1 }],
    sitemapSource: "crawled",
    scenarios: [
      { scenarioId: "SC-1", title: "Check header CTA", index: 0, status: "success" as const },
      { scenarioId: "SC-2", title: "Verify form validation", index: 1, status: "running" as const },
    ],
    totalScenarios: 2,
    tasks: [{ id: "phase-discovery", label: "Discovering site pages", status: "success" as const }],
    logs: [{ message: "Execution in progress", level: "info" as const, timestamp: 1 }],
  };

  test("renders stable running sections and key hints", () => {
    const budget = computeViewportBudget(30, 100);
    const tree = AppRunningView({ state: runningState, budget });
    const signature = collectSignature(tree);

    expect(signature).toEqual(
      expect.arrayContaining([
        "PhaseIndicator",
        "ProgressBar",
        "KeyHints",
        "LogStream",
      ])
    );
    // Sitemap, scenarios, tasks must be present at standard density
    expect(signature.some((s) => s.startsWith("SitemapDisplay"))).toBe(true);
    expect(signature.some((s) => s.startsWith("ScenarioList"))).toBe(true);
    expect(signature.some((s) => s.startsWith("TaskList"))).toBe(true);
    expect(QA_RUNNING_HINTS.map((hint) => hint.key)).toEqual(["↑/k", "↓/j", "PgUp/PgDn", "g/G"]);
  });

  test("keeps compact and standard layouts stable", () => {
    const standard = collectSignature(
      AppRunningView({ state: runningState, budget: computeViewportBudget(30, 100) })
    );
    const compact = collectSignature(
      AppRunningView({ state: runningState, budget: computeViewportBudget(24, 80) })
    );

    expect(standard).toMatchInlineSnapshot(`
      [
        "PhaseIndicator",
        "SitemapDisplay(maxHeight=5)",
        "ProgressBar",
        "ScenarioList(maxHeight=6)",
        "TaskList(maxHeight=4)",
        "KeyHints",
        "LogStream",
      ]
    `);

    expect(compact).toMatchInlineSnapshot(`
      [
        "PhaseIndicator",
        "SitemapDisplay(maxHeight=4)",
        "ProgressBar",
        "ScenarioList(maxHeight=4)",
        "TaskList(maxHeight=3)",
        "KeyHints",
        "LogStream",
      ]
    `);
  });
});
