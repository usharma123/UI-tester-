import { describe, it, expect } from "bun:test";
import {
  ReportSchema,
  safeParseReport,
  validateReport,
  TestScenarioSchema,
  AgentActionSchema,
} from "../src/qa/schemas.js";

describe("TestScenarioSchema", () => {
  it("should validate a valid scenario", () => {
    const scenario = {
      id: "login-form-validation",
      title: "Login form rejects empty email",
      description: "Test that submitting empty email shows validation error",
      startUrl: "https://example.com/login",
      priority: "high",
      category: "forms",
      maxSteps: 10,
    };

    const result = TestScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("should reject invalid priority", () => {
    const scenario = {
      id: "test",
      title: "Test",
      description: "Test",
      startUrl: "https://example.com",
      priority: "urgent",
      category: "forms",
      maxSteps: 10,
    };

    const result = TestScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(false);
  });

  it("should reject maxSteps over 50", () => {
    const scenario = {
      id: "test",
      title: "Test",
      description: "Test",
      startUrl: "https://example.com",
      priority: "medium",
      category: "forms",
      maxSteps: 100,
    };

    const result = TestScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(false);
  });
});

describe("AgentActionSchema", () => {
  it("should validate a click action", () => {
    const action = {
      type: "click",
      selector: "button:has-text('Submit')",
      reasoning: "Click the submit button to test form validation",
    };

    const result = AgentActionSchema.safeParse(action);
    expect(result.success).toBe(true);
  });

  it("should validate a done action with result", () => {
    const action = {
      type: "done",
      reasoning: "Form validation works correctly",
      result: "pass",
    };

    const result = AgentActionSchema.safeParse(action);
    expect(result.success).toBe(true);
  });

  it("should validate a select action", () => {
    const action = {
      type: "select",
      selector: "select#currency",
      value: "USD",
      reasoning: "Select USD from the currency dropdown",
    };

    const result = AgentActionSchema.safeParse(action);
    expect(result.success).toBe(true);
  });

  it("should reject invalid action type", () => {
    const action = {
      type: "drag",
      reasoning: "Drag element",
    };

    const result = AgentActionSchema.safeParse(action);
    expect(result.success).toBe(false);
  });
});

describe("ReportSchema", () => {
  it("should validate a valid report", () => {
    const report = {
      url: "https://example.com",
      testedFlows: ["Homepage load", "Form submission"],
      score: 85,
      summary: "Overall good quality with minor issues",
      issues: [
        {
          severity: "medium",
          title: "Form lacks validation",
          category: "Forms",
          reproSteps: ["Fill form with empty email", "Click submit"],
          expected: "Show validation error",
          actual: "Form submits with empty field",
          evidence: ["screenshots/step-01.png"],
          suggestedFix: "Add required attribute to email field",
        },
      ],
      artifacts: {
        screenshots: ["screenshots/step-01.png"],
        evidenceFile: "reports/evidence.json",
      },
    };

    const result = safeParseReport(report);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score).toBe(85);
      expect(result.data.issues).toHaveLength(1);
    }
  });

  it("should reject score out of range", () => {
    const report = {
      url: "https://example.com",
      testedFlows: [],
      score: 150,
      summary: "Test",
      issues: [],
      artifacts: { screenshots: [], evidenceFile: "" },
    };

    const result = safeParseReport(report);
    expect(result.success).toBe(false);
  });

  it("should reject negative score", () => {
    const report = {
      url: "https://example.com",
      testedFlows: [],
      score: -10,
      summary: "Test",
      issues: [],
      artifacts: { screenshots: [], evidenceFile: "" },
    };

    const result = safeParseReport(report);
    expect(result.success).toBe(false);
  });

  it("should reject invalid severity", () => {
    const report = {
      url: "https://example.com",
      testedFlows: [],
      score: 50,
      summary: "Test",
      issues: [
        {
          severity: "critical",
          title: "Test",
          category: "Forms",
          reproSteps: [],
          expected: "",
          actual: "",
          evidence: [],
          suggestedFix: "",
        },
      ],
      artifacts: { screenshots: [], evidenceFile: "" },
    };

    const result = safeParseReport(report);
    expect(result.success).toBe(false);
  });

  it("should validate all valid severities", () => {
    const severities = ["blocker", "high", "medium", "low", "nit"] as const;

    for (const severity of severities) {
      const report = {
        url: "https://example.com",
        testedFlows: [],
        score: 50,
        summary: "Test",
        issues: [
          {
            severity,
            title: "Test",
            category: "Forms",
            reproSteps: [],
            expected: "",
            actual: "",
            evidence: [],
            suggestedFix: "",
          },
        ],
        artifacts: { screenshots: [], evidenceFile: "" },
      };

      const result = safeParseReport(report);
      expect(result.success).toBe(true);
    }
  });

  it("should validate all valid categories", () => {
    const categories = ["Navigation", "Forms", "Accessibility", "Visual", "Feedback", "Content"] as const;

    for (const category of categories) {
      const report = {
        url: "https://example.com",
        testedFlows: [],
        score: 50,
        summary: "Test",
        issues: [
          {
            severity: "low",
            title: "Test",
            category,
            reproSteps: [],
            expected: "",
            actual: "",
            evidence: [],
            suggestedFix: "",
          },
        ],
        artifacts: { screenshots: [], evidenceFile: "" },
      };

      const result = safeParseReport(report);
      expect(result.success).toBe(true);
    }
  });
});

describe("validateReport", () => {
  it("should throw on invalid report", () => {
    expect(() => validateReport({ score: 200 })).toThrow();
  });

  it("should return valid report", () => {
    const report = {
      url: "https://example.com",
      testedFlows: [],
      score: 100,
      summary: "Perfect",
      issues: [],
      artifacts: { screenshots: [], evidenceFile: "" },
    };
    const result = validateReport(report);
    expect(result.score).toBe(100);
  });
});
