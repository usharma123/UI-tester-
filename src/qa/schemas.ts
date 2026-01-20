import { z } from "zod";

export const StepTypeSchema = z.enum([
  "open",
  "snapshot",
  "click",
  "fill",
  "press",
  "getText",
  "screenshot",
]);

export const StepSchema = z.object({
  type: StepTypeSchema,
  selector: z.string().optional(),
  text: z.string().optional(),
  key: z.string().optional(),
  path: z.string().optional(),
  note: z.string().optional(),
});

export const PlanSchema = z.object({
  url: z.string().url(),
  steps: z.array(StepSchema).max(20),
});

// Schema for per-page test plan (no URL required, fewer steps)
export const PagePlanSchema = z.object({
  steps: z.array(StepSchema).max(10),
});

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

export type PlanInput = z.input<typeof PlanSchema>;
export type PlanOutput = z.output<typeof PlanSchema>;
export type PagePlanInput = z.input<typeof PagePlanSchema>;
export type PagePlanOutput = z.output<typeof PagePlanSchema>;
export type ReportInput = z.input<typeof ReportSchema>;
export type ReportOutput = z.output<typeof ReportSchema>;

export function validatePlan(data: unknown): PlanOutput {
  return PlanSchema.parse(data);
}

export function validateReport(data: unknown): ReportOutput {
  return ReportSchema.parse(data);
}

export function safeParsePlan(data: unknown): { success: true; data: PlanOutput } | { success: false; error: z.ZodError } {
  const result = PlanSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function safeParsePagePlan(data: unknown): { success: true; data: PagePlanOutput } | { success: false; error: z.ZodError } {
  const result = PagePlanSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function safeParseReport(data: unknown): { success: true; data: ReportOutput } | { success: false; error: z.ZodError } {
  const result = ReportSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
