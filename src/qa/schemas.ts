import { z } from "zod";

// =============================================================================
// Test Scenario Schema
// =============================================================================

export const TestScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  startUrl: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum(["forms", "navigation", "auth", "content", "interaction", "e2e"]),
  maxSteps: z.number().min(1).max(50),
});

// =============================================================================
// Agent Action Schema
// =============================================================================

export const AgentActionSchema = z.object({
  type: z.enum(["click", "fill", "press", "hover", "scroll", "navigate", "wait", "assert", "done"]),
  selector: z.string().optional(),
  value: z.string().optional(),
  reasoning: z.string(),
  result: z.enum(["pass", "fail"]).optional(),
});

// =============================================================================
// Report Schema (for LLM output validation)
// =============================================================================

export const IssueSeveritySchema = z.enum(["blocker", "high", "medium", "low", "nit"]);

export const IssueCategorySchema = z.enum([
  "Navigation",
  "Forms",
  "Accessibility",
  "Visual",
  "Feedback",
  "Content",
]);

export const IssueSchema = z.object({
  severity: IssueSeveritySchema,
  title: z.string(),
  category: IssueCategorySchema,
  reproSteps: z.array(z.string()),
  expected: z.string(),
  actual: z.string(),
  evidence: z.array(z.string()),
  suggestedFix: z.string(),
});

export const ReportSchema = z.object({
  url: z.string().url(),
  testedFlows: z.array(z.string()),
  score: z.number().min(0).max(100),
  summary: z.string(),
  issues: z.array(IssueSchema),
  artifacts: z.object({
    screenshots: z.array(z.string()),
    evidenceFile: z.string(),
  }),
});

export type ReportInput = z.input<typeof ReportSchema>;
export type ReportOutput = z.output<typeof ReportSchema>;

export function validateReport(data: unknown): ReportOutput {
  return ReportSchema.parse(data);
}

export function safeParseReport(data: unknown): { success: true; data: ReportOutput } | { success: false; error: z.ZodError } {
  const result = ReportSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
