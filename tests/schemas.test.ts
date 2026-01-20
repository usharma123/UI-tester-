import { describe, it, expect } from "bun:test";
import {
  PlanSchema,
  ReportSchema,
  safeParsePlan,
  safeParseReport,
  validatePlan,
  validateReport,
} from "../src/qa/schemas.js";

describe("PlanSchema", () => {
  it("should validate a valid plan", () => {
    const plan = {
      url: "https://example.com",
      steps: [
        { type: "open", selector: "https://example.com", note: "Open homepage" },
        { type: "snapshot", note: "Capture initial state" },
        { type: "click", selector: "@e1", note: "Click main button" },
        { type: "fill", selector: "@e2", text: "test@example.com", note: "Fill email" },
        { type: "press", key: "Tab", note: "Tab to next field" },
        { type: "screenshot", path: "test.png", note: "Take screenshot" },
      ],
    };

    const result = safeParsePlan(plan);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe("https://example.com");
      expect(result.data.steps).toHaveLength(6);
    }
  });

  it("should reject invalid URL", () => {
    const plan = {
      url: "not-a-url",
      steps: [],
    };

    const result = safeParsePlan(plan);
    expect(result.success).toBe(false);
  });

  it("should reject too many steps", () => {
    const steps = Array(21).fill({ type: "snapshot" });
    const plan = {
      url: "https://example.com",
      steps,
    };

    const result = safeParsePlan(plan);
    expect(result.success).toBe(false);
  });

  it("should reject invalid step type", () => {
    const plan = {
      url: "https://example.com",
      steps: [{ type: "invalid" }],
    };

    const result = safeParsePlan(plan);
    expect(result.success).toBe(false);
  });

  it("should allow optional fields", () => {
    const plan = {
      url: "https://example.com",
      steps: [{ type: "snapshot" }],
    };

    const result = safeParsePlan(plan);
    expect(result.success).toBe(true);
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

  it("should reject invalid category", () => {
    const report = {
      url: "https://example.com",
      testedFlows: [],
      score: 50,
      summary: "Test",
      issues: [
        {
          severity: "low",
          title: "Test",
          category: "InvalidCategory",
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

describe("validatePlan", () => {
  it("should throw on invalid plan", () => {
    expect(() => validatePlan({ url: "not-valid" })).toThrow();
  });

  it("should return valid plan", () => {
    const plan = { url: "https://example.com", steps: [] };
    const result = validatePlan(plan);
    expect(result.url).toBe("https://example.com");
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
