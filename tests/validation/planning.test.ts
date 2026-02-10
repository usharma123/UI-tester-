import { describe, expect, it } from "bun:test";
import type { TestScenario } from "../../src/qa/types.js";
import type { Requirement } from "../../src/validation/types.js";
import { __planningInternals } from "../../src/validation/phases/planning.js";

function makeRequirement(id: string, summary: string, priority: Requirement["priority"] = "must"): Requirement {
  return {
    id,
    sourceLocation: { file: "./requirements.md" },
    rawText: summary,
    summary,
    category: "functional",
    priority,
    testable: true,
    acceptanceCriteria: [`Validate ${summary}`],
  };
}

describe("planning internals", () => {
  it("finds uncovered must/should requirements", () => {
    const requirements: Requirement[] = [
      makeRequirement("REQ-001", "Login form"),
      makeRequirement("REQ-002", "Currency dropdown"),
      makeRequirement("REQ-003", "Footer links", "could"),
    ];

    const scenarios: TestScenario[] = [
      {
        id: "s1",
        title: "Test login",
        description: "Validate login form",
        startUrl: "http://localhost:3000",
        priority: "high",
        category: "forms",
        maxSteps: 6,
        scope: "page",
        requirementIds: ["REQ-001"],
      },
    ];

    const uncovered = __planningInternals.findUncoveredMustShould(requirements, scenarios);
    expect(uncovered.map((r) => r.id)).toEqual(["REQ-002"]);
  });

  it("ranks pages by uncovered requirement keywords", () => {
    const urls = [
      "http://localhost:3000",
      "http://localhost:3000/currency",
      "http://localhost:3000/help",
    ];
    const ranked = __planningInternals.rankPagesForRequirements(urls, [
      makeRequirement("REQ-010", "Currency conversion"),
      makeRequirement("REQ-011", "Swap currency dropdown"),
    ]);

    expect(ranked[0]).toBe("http://localhost:3000/currency");
  });

  it("infers requirement IDs and deduplicates scenarios", () => {
    const requirements: Requirement[] = [
      makeRequirement("REQ-020", "Page load time performance"),
      makeRequirement("REQ-021", "UI response latency"),
    ];

    const scenarios: TestScenario[] = [
      {
        id: "perf-check",
        title: "Measure page load performance",
        description: "check page load time and UI response",
        startUrl: "http://localhost:3000",
        priority: "medium",
        category: "content",
        maxSteps: 5,
        scope: "page",
      },
      {
        id: "perf-check",
        title: "Measure page load performance",
        description: "duplicate scenario",
        startUrl: "http://localhost:3000",
        priority: "medium",
        category: "content",
        maxSteps: 5,
        scope: "page",
      },
    ];

    __planningInternals.mergeAndAnnotateScenarios(scenarios, requirements);
    expect(scenarios.length).toBe(1);
    expect((scenarios[0].requirementIds || []).length).toBeGreaterThan(0);
  });
});
