import OpenAI from "openai";
import type { Config } from "../config.js";
import type { Evidence, Report, AuditEntry, DomAuditSample } from "./types.js";
import { safeParseReport } from "./schemas.js";
import { JUDGE_SYSTEM_PROMPT, buildJudgePrompt } from "../prompts/judge.js";
import { truncateSnapshot } from "../utils/redact.js";

export interface JudgeResult {
  report: Report;
  rawResponse: string;
}

function extractJson(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return text;
}

function formatExecutedSteps(evidence: Evidence): string {
  return evidence.executedSteps
    .map((step) => {
      const statusIcon = step.status === "success" ? "[OK]" : step.status === "blocked" ? "[BLOCKED]" : "[FAIL]";
      const error = step.error ? ` - Error: ${step.error}` : "";
      const result = step.result ? ` - ${step.result}` : "";
      const note = step.step.note ? ` (${step.step.note})` : "";
      return `${statusIcon} Step ${step.index}: ${step.step.type}${note}${result}${error}`;
    })
    .join("\n");
}

function formatSnapshots(evidence: Evidence): string {
  return evidence.snapshots
    .map((s) => {
      const truncated = truncateSnapshot(s.content, 5000);
      return `--- Snapshot at step ${s.stepIndex} ---\n${truncated}`;
    })
    .join("\n\n");
}

function formatErrors(evidence: Evidence): string {
  if (evidence.errors.length === 0) {
    return "No errors encountered.";
  }
  return evidence.errors.map((e) => `Step ${e.stepIndex}: ${e.error}`).join("\n");
}

function formatAuditSamples(samples: DomAuditSample[]): string {
  if (!samples.length) return "none";
  return samples.map((s) => `${s.selector}${s.text ? ` (${s.text})` : ""}`).join("; ");
}

function hasAuditIssues(audit: AuditEntry): boolean {
  const summary = audit.summary;
  return (
    summary.imagesMissingAlt > 0 ||
    summary.inputsMissingLabel > 0 ||
    summary.buttonsMissingLabel > 0 ||
    summary.linksGenericText > 0 ||
    summary.emptyHeadings > 0 ||
    summary.headingOrderIssues > 0 ||
    summary.smallTouchTargets > 0 ||
    summary.htmlLangMissing ||
    summary.horizontalOverflowPx > 0
  );
}

function formatAudits(audits: AuditEntry[] | undefined): string {
  if (!audits || audits.length === 0) {
    return "No DOM audits available.";
  }

  const MAX_AUDITS = 10;
  const withIssues = audits.filter(hasAuditIssues);
  const selected = (withIssues.length > 0 ? withIssues : audits).slice(0, MAX_AUDITS);
  const truncatedCount = (withIssues.length > 0 ? withIssues : audits).length - selected.length;

  const formatted = selected
    .map((audit) => {
      const summary = audit.summary;
      const samples = audit.samples;
      return [
        `--- Audit: ${audit.label} @ ${audit.pageUrl} (${audit.viewport.width}x${audit.viewport.height}) ---`,
        `Missing alt: ${summary.imagesMissingAlt} | Missing labels: ${summary.inputsMissingLabel} | Buttons w/o label: ${summary.buttonsMissingLabel}`,
        `Generic link text: ${summary.linksGenericText} | Empty headings: ${summary.emptyHeadings} | H1 count: ${summary.h1Count}`,
        `Heading order issues: ${summary.headingOrderIssues} | Small targets: ${summary.smallTouchTargets} | Lang missing: ${summary.htmlLangMissing}`,
        `Horizontal overflow px: ${summary.horizontalOverflowPx}`,
        `Samples alt: ${formatAuditSamples(samples.imagesMissingAlt)}`,
        `Samples labels: ${formatAuditSamples(samples.inputsMissingLabel)}`,
        `Samples buttons: ${formatAuditSamples(samples.buttonsMissingLabel)}`,
        `Samples links: ${formatAuditSamples(samples.linksGenericText)}`,
        `Samples headings: ${formatAuditSamples(samples.emptyHeadings)}`,
        `Samples heading order: ${formatAuditSamples(samples.headingOrderIssues)}`,
        `Samples touch targets: ${formatAuditSamples(samples.smallTouchTargets)}`,
      ].join("\n");
    })
    .join("\n\n");

  if (truncatedCount > 0) {
    return `${formatted}\n\n... ${truncatedCount} more audit results omitted`;
  }

  return formatted;
}

export async function evaluateEvidence(
  config: Config,
  evidence: Evidence,
  evidenceFilePath: string
): Promise<JudgeResult> {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: config.openRouterApiKey,
  });

  const executedStepsStr = formatExecutedSteps(evidence);
  const snapshotsStr = formatSnapshots(evidence);
  const errorsStr = formatErrors(evidence);
  const auditsStr = formatAudits(evidence.audits);
  const screenshotPaths = Object.keys(evidence.screenshotMap);

  const userPrompt = buildJudgePrompt(
    evidence.plan.url,
    executedStepsStr,
    snapshotsStr,
    errorsStr,
    auditsStr,
    screenshotPaths,
    evidenceFilePath
  );

  let lastError: Error | null = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    if (attempt > 0 && lastError) {
      messages.push({
        role: "user",
        content: `Your previous response was invalid JSON. Error: ${lastError.message}\n\nPlease output ONLY valid JSON matching the schema. No markdown, no explanation.`,
      });
    }

    const response = await client.chat.completions.create({
      model: config.openRouterModel,
      messages,
      temperature: 0.1,
      max_tokens: 6000,
    });

    const rawResponse = response.choices[0]?.message?.content ?? "";

    try {
      const jsonStr = extractJson(rawResponse);
      const parsed = JSON.parse(jsonStr);

      parsed.artifacts = parsed.artifacts || {};
      parsed.artifacts.screenshots = screenshotPaths;
      parsed.artifacts.evidenceFile = evidenceFilePath;

      const validated = safeParseReport(parsed);

      if (validated.success) {
        return {
          report: validated.data,
          rawResponse,
        };
      }

      lastError = new Error(
        `Schema validation failed: ${validated.error.errors.map((e) => e.message).join(", ")}`
      );
    } catch (parseError) {
      lastError = parseError instanceof Error ? parseError : new Error(String(parseError));
    }
  }

  throw new Error(`Failed to generate valid report after ${maxRetries} attempts: ${lastError?.message}`);
}
