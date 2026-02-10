import { describe, expect, it } from "bun:test";
import { buildCrossValidatorPrompt } from "../../src/prompts/cross-validator.js";
import type { Requirement, RubricCriterion } from "../../src/validation/types.js";
import type { ValidationProbeResult } from "../../src/validation/probes/types.js";

const requirements: Requirement[] = [
  {
    id: "REQ-018",
    sourceLocation: { file: "./requirements.md" },
    rawText: "Keyboard support",
    summary: "Complete keyboard navigation support",
    category: "accessibility",
    priority: "must",
    testable: true,
    acceptanceCriteria: ["Tab navigation works", "Enter activates controls"],
  },
  {
    id: "REQ-020",
    sourceLocation: { file: "./requirements.md" },
    rawText: "Load under 2s",
    summary: "Page load time under 2 seconds",
    category: "performance",
    priority: "should",
    testable: true,
    acceptanceCriteria: ["Render within 2 seconds"],
  },
];

const rubric: RubricCriterion[] = [
  {
    requirementId: "REQ-018",
    criterion: "Keyboard nav",
    weight: 8,
    passCondition: "Keyboard-only flow works",
    failCondition: "Keyboard-only flow blocked",
  },
  {
    requirementId: "REQ-020",
    criterion: "Load budget",
    weight: 6,
    passCondition: "Load under 2 seconds",
    failCondition: "Load exceeds 2 seconds",
  },
];

const probes: ValidationProbeResult[] = [
  {
    id: "probe-keyboard-navigation",
    kind: "keyboard",
    status: "pass",
    summary: "Keyboard probe succeeded",
    evidence: ["/tmp/keyboard.png"],
    coveredRequirementIds: ["REQ-018"],
    metrics: { focusTargetsObserved: 4 },
    findings: ["Tab 1 reached amount field"],
  },
  {
    id: "probe-performance-budgets",
    kind: "performance",
    status: "partial",
    summary: "Performance probe found load regression",
    evidence: ["/tmp/perf.png"],
    coveredRequirementIds: ["REQ-020"],
    metrics: { loadTimeMs: 2300, uiLatencyMs: 60 },
  },
];

describe("buildCrossValidatorPrompt", () => {
  it("includes scenario and probe coverage hints", () => {
    const prompt = buildCrossValidatorPrompt(requirements, rubric, {
      pagesVisited: ["http://localhost:3000"],
      stepsExecuted: [
        { type: "click", selector: "button", result: "success", screenshot: "/tmp/a.png" },
      ],
      errors: [],
      screenshots: ["/tmp/a.png"],
      scenarioRuns: [
        {
          scenarioId: "keyboard-flow",
          title: "Keyboard flow",
          status: "pass",
          summary: "Keyboard works",
          requirementIds: ["REQ-018"],
          steps: [{ action: "press Tab", success: true }],
        },
      ],
      probeResults: probes,
    });

    expect(prompt).toContain("## Probe Results");
    expect(prompt).toContain("probe-keyboard-navigation");
    expect(prompt).toContain("## Requirement Coverage Hints");
    expect(prompt).toContain("REQ-018: scenarios=keyboard-flow:pass; probes=keyboard:pass");
    expect(prompt).toContain("REQ-020: scenarios=none; probes=performance:partial");
  });
});
