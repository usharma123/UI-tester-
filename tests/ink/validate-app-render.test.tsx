import { describe, expect, test } from "bun:test";
import React from "react";
import { ValidateRunningView, VALIDATION_RUNNING_HINTS } from "../../src/ink/ValidateApp.js";
import { computeViewportBudget } from "../../src/ink/layout/useViewportBudget.js";
import { initialValidateState } from "../../src/ink/validate-types.js";

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

describe("ValidateRunningView", () => {
  const runningState = {
    ...initialValidateState,
    mode: "running" as const,
    currentPhase: "execution" as const,
    completedPhases: ["parsing", "extraction", "rubric", "discovery"] as const,
    requirements: [
      {
        id: "REQ-001",
        sourceLocation: { file: "./requirements.md", line: 10, section: "BR-001" },
        rawText: "Must convert amount",
        summary: "Currency conversion formula accuracy",
        category: "functional" as const,
        priority: "must" as const,
        testable: true,
        acceptanceCriteria: ["Enter 100 and verify output"],
      },
    ],
    rubric: {
      criteria: [
        {
          requirementId: "REQ-001",
          criterion: "Calculation is correct",
          weight: 10,
          passCondition: "Value matches expected",
          failCondition: "Value does not match expected",
        },
      ],
      maxScore: 10,
    },
    sitemap: [{ loc: "https://example.com", priority: 1 }],
    pagesProgress: { tested: 1, skipped: 0, remaining: 0, total: 1 },
    validatedCount: 1,
    logs: [{ message: "Cross validating", level: "info" as const, timestamp: 1 }],
  };

  test("renders stable validation sections and key hints", () => {
    const budget = computeViewportBudget(30, 100);
    const tree = ValidateRunningView({ state: runningState, budget });
    const signature = collectSignature(tree);

    expect(signature).toEqual(
      expect.arrayContaining([
        "ValidationProgress",
        "ProgressBar",
        "KeyHints",
        "LogStream",
      ])
    );
    expect(signature.some((s) => s.startsWith("RequirementList"))).toBe(true);
    expect(signature.some((s) => s.startsWith("RubricDisplay"))).toBe(true);
    expect(signature.some((s) => s.startsWith("SitemapDisplay"))).toBe(true);
    expect(VALIDATION_RUNNING_HINTS.map((hint) => hint.key)).toEqual([
      "↑/k",
      "↓/j",
      "PgUp/PgDn",
      "g/G",
    ]);
  });

  test("keeps compact and standard layouts stable", () => {
    const standard = collectSignature(
      ValidateRunningView({ state: runningState, budget: computeViewportBudget(30, 100) })
    );
    const compact = collectSignature(
      ValidateRunningView({ state: runningState, budget: computeViewportBudget(24, 80) })
    );

    expect(standard).toMatchInlineSnapshot(`
      [
        "ValidationProgress",
        "RequirementList(maxHeight=5)",
        "RubricDisplay(maxHeight=4)",
        "SitemapDisplay(maxHeight=5)",
        "ProgressBar",
        "ProgressBar",
        "KeyHints",
        "LogStream",
      ]
    `);

    expect(compact).toMatchInlineSnapshot(`
      [
        "ValidationProgress",
        "RequirementList(maxHeight=4)",
        "RubricDisplay(maxHeight=3)",
        "SitemapDisplay(maxHeight=4)",
        "ProgressBar",
        "ProgressBar",
        "KeyHints",
        "LogStream",
      ]
    `);
  });
});
