/**
 * Zod schemas for validation types
 */

import { z } from "zod";

/**
 * Requirement category enum
 */
export const RequirementCategorySchema = z.enum([
  "functional",
  "ui",
  "accessibility",
  "performance",
  "security",
]);

/**
 * Requirement priority enum (MoSCoW)
 */
export const RequirementPrioritySchema = z.enum([
  "must",
  "should",
  "could",
  "wont",
]);

/**
 * Source location in document
 */
export const SourceLocationSchema = z.object({
  file: z.string(),
  line: z.number().optional(),
  section: z.string().optional(),
});

/**
 * Single requirement
 */
export const RequirementSchema = z.object({
  id: z.string().regex(/^REQ-\d{3}$/, "ID must be in format REQ-XXX"),
  sourceLocation: SourceLocationSchema,
  rawText: z.string().min(1),
  summary: z.string().min(1),
  category: RequirementCategorySchema,
  priority: RequirementPrioritySchema,
  testable: z.boolean(),
  acceptanceCriteria: z.array(z.string()).min(1),
});

/**
 * Array of requirements from extraction
 */
export const ExtractedRequirementsSchema = z.object({
  requirements: z.array(RequirementSchema),
});

/**
 * Single rubric criterion
 */
export const RubricCriterionSchema = z.object({
  requirementId: z.string(),
  criterion: z.string().min(1),
  weight: z.number().min(1).max(10),
  passCondition: z.string().min(1),
  failCondition: z.string().min(1),
});

/**
 * Complete rubric
 */
export const RubricSchema = z.object({
  criteria: z.array(RubricCriterionSchema),
  maxScore: z.number().min(0),
});

/**
 * Requirement status enum
 */
export const RequirementStatusSchema = z.enum([
  "pass",
  "partial",
  "fail",
  "not_tested",
]);

/**
 * Single requirement result
 */
export const RequirementResultSchema = z.object({
  requirementId: z.string(),
  status: RequirementStatusSchema,
  score: z.number().min(0).max(100),
  evidence: z.array(z.string()),
  reasoning: z.string(),
});

export const ValidationProbeResultSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.enum(["pass", "partial", "fail", "error"]),
  summary: z.string(),
  evidence: z.array(z.string()),
  coveredRequirementIds: z.array(z.string()),
  metrics: z.record(z.string(), z.number()).optional(),
  findings: z.array(z.string()).optional(),
});

/**
 * Cross-validation results
 */
export const CrossValidationResultsSchema = z.object({
  results: z.array(RequirementResultSchema),
});

/**
 * Complete traceability report
 */
export const TraceabilityReportSchema = z.object({
  specFile: z.string(),
  url: z.string().url(),
  requirements: z.array(RequirementSchema),
  rubric: RubricSchema,
  results: z.array(RequirementResultSchema),
  probeResults: z.array(ValidationProbeResultSchema).optional(),
  probeSummary: z
    .object({
      total: z.number().min(0),
      passed: z.number().min(0),
      failed: z.number().min(0),
    })
    .optional(),
  overallScore: z.number().min(0).max(100),
  coverageScore: z.number().min(0).max(100),
  summary: z.string(),
  timestamp: z.number(),
});

/**
 * Validation helper functions
 */
export function validateRequirements(data: unknown) {
  return ExtractedRequirementsSchema.parse(data);
}

export function validateRubric(data: unknown) {
  return RubricSchema.parse(data);
}

export function validateCrossValidationResults(data: unknown) {
  return CrossValidationResultsSchema.parse(data);
}

export function safeParseRequirements(data: unknown) {
  return ExtractedRequirementsSchema.safeParse(data);
}

export function safeParseRubric(data: unknown) {
  return RubricSchema.safeParse(data);
}

export function safeParseCrossValidationResults(data: unknown) {
  return CrossValidationResultsSchema.safeParse(data);
}
