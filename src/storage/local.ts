import { join } from "node:path";
import { mkdir, writeFile, readFile, copyFile, readdir } from "node:fs/promises";
import type { Report, Evidence } from "../qa/types.js";

// Local storage directory (in current working directory)
const LOCAL_STORAGE_DIR = join(process.cwd(), ".ui-qa-runs");

// Check if a runId is a CLI-generated ID
export function isCliRunId(runId: string): boolean {
  return runId.startsWith("cli-");
}

// Get the directory for a specific run
function getRunDir(runId: string): string {
  return join(LOCAL_STORAGE_DIR, runId);
}

// Ensure the run directory exists
async function ensureRunDir(runId: string): Promise<string> {
  const runDir = getRunDir(runId);
  await mkdir(runDir, { recursive: true });
  await mkdir(join(runDir, "screenshots"), { recursive: true });
  return runDir;
}

// Run metadata interface
export interface LocalRunData {
  runId: string;
  url: string;
  goals: string;
  status: "running" | "completed" | "failed";
  score?: number;
  summary?: string;
  report?: Report;
  evidence?: Evidence;
  error?: string;
  eventsFile?: string;
  startedAt: number;
  completedAt?: number;
  screenshots: Array<{
    stepIndex: number;
    label: string;
    filename: string;
    localPath: string;
  }>;
}

// Create a new local run
export async function createLocalRun(runId: string, url: string, goals: string): Promise<void> {
  const runDir = await ensureRunDir(runId);

  const runData: LocalRunData = {
    runId,
    url,
    goals,
    status: "running",
    startedAt: Date.now(),
    screenshots: [],
  };

  await writeFile(join(runDir, "run.json"), JSON.stringify(runData, null, 2));
}

export async function setLocalRunEventsFile(runId: string, eventsFile: string): Promise<void> {
  await updateLocalRun(runId, { eventsFile });
}

// Get local run data
export async function getLocalRun(runId: string): Promise<LocalRunData | null> {
  try {
    const runDir = getRunDir(runId);
    const data = await readFile(join(runDir, "run.json"), "utf-8");
    return JSON.parse(data) as LocalRunData;
  } catch {
    return null;
  }
}

// Update local run data
async function updateLocalRun(runId: string, updates: Partial<LocalRunData>): Promise<void> {
  const runDir = getRunDir(runId);
  const existing = await getLocalRun(runId);

  if (!existing) {
    throw new Error(`Run ${runId} not found`);
  }

  const updated = { ...existing, ...updates };
  await writeFile(join(runDir, "run.json"), JSON.stringify(updated, null, 2));
}

// Save a screenshot locally
export async function saveLocalScreenshot(
  runId: string,
  sourcePath: string,
  stepIndex: number,
  label: string
): Promise<{ localPath: string }> {
  const runDir = await ensureRunDir(runId);
  const filename = `step-${String(stepIndex).padStart(3, "0")}-${label.replace(/[^a-zA-Z0-9]/g, "-")}.png`;
  const destPath = join(runDir, "screenshots", filename);

  await copyFile(sourcePath, destPath);

  // Update run data with screenshot info
  const runData = await getLocalRun(runId);
  if (runData) {
    runData.screenshots.push({
      stepIndex,
      label,
      filename,
      localPath: destPath,
    });
    await writeFile(join(runDir, "run.json"), JSON.stringify(runData, null, 2));
  }

  return { localPath: destPath };
}

// Complete a local run
export async function completeLocalRun(
  runId: string,
  score: number,
  summary: string,
  report: Report,
  evidence: Evidence
): Promise<void> {
  await updateLocalRun(runId, {
    status: "completed",
    score,
    summary,
    report,
    evidence,
    completedAt: Date.now(),
  });
}

// Fail a local run
export async function failLocalRun(runId: string, error: string): Promise<void> {
  await updateLocalRun(runId, {
    status: "failed",
    error,
    completedAt: Date.now(),
  });
}

// List all local runs
export async function listLocalRuns(): Promise<LocalRunData[]> {
  try {
    await mkdir(LOCAL_STORAGE_DIR, { recursive: true });
    const dirs = await readdir(LOCAL_STORAGE_DIR);
    const runs: LocalRunData[] = [];

    for (const dir of dirs) {
      const runData = await getLocalRun(dir);
      if (runData) {
        runs.push(runData);
      }
    }

    // Sort by startedAt descending
    return runs.sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [];
  }
}

// Get the local storage directory path
export function getLocalStorageDir(): string {
  return LOCAL_STORAGE_DIR;
}

// Generate report.md file
export async function generateReportMarkdown(runId: string, report: Report): Promise<string> {
  const runDir = getRunDir(runId);
  const reportPath = join(runDir, "report.md");

  const severityEmoji: Record<string, string> = {
    blocker: "🚨",
    high: "🔴",
    medium: "🟡",
    low: "🔵",
    nit: "⚪",
  };

  const lines: string[] = [
    `# QA Test Report`,
    ``,
    `**URL:** ${report.url}`,
    `**Score:** ${report.score}/100`,
    ``,
    `## Summary`,
    ``,
    report.summary,
    ``,
    `## Tested Flows`,
    ``,
    ...report.testedFlows.map((flow) => `- ${flow}`),
    ``,
    `## Issues (${report.issues.length})`,
    ``,
  ];

  for (const issue of report.issues) {
    lines.push(`### ${severityEmoji[issue.severity] || ""} [${issue.severity.toUpperCase()}] ${issue.title}`);
    lines.push(``);
    lines.push(`**Category:** ${issue.category}`);
    lines.push(``);
    lines.push(`**Expected:** ${issue.expected}`);
    lines.push(``);
    lines.push(`**Actual:** ${issue.actual}`);
    lines.push(``);
    if (issue.reproSteps.length > 0) {
      lines.push(`**Reproduction Steps:**`);
      issue.reproSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
      lines.push(``);
    }
    lines.push(`**Suggested Fix:** ${issue.suggestedFix}`);
    lines.push(``);
    if (issue.evidence.length > 0) {
      lines.push(`**Evidence:**`);
      issue.evidence.forEach((ev) => lines.push(`- ${ev}`));
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(``);
  }

  lines.push(`## Artifacts`);
  lines.push(``);
  lines.push(`- **Screenshots:** ${join(runDir, "screenshots")}`);
  lines.push(`- **Evidence File:** ${report.artifacts.evidenceFile}`);
  lines.push(`- **LLM Fix Guide:** ${join(runDir, "llm-fix.txt")}`);

  const content = lines.join("\n");
  await writeFile(reportPath, content);
  return reportPath;
}

// Generate llm-fix.txt file with actionable fixes for LLMs
// Format: Plain text optimized for copy-pasting directly into an LLM chat
export async function generateLlmFixFile(runId: string, report: Report): Promise<string> {
  const runDir = getRunDir(runId);
  const fixPath = join(runDir, "llm-fix.txt");

  // Group issues by severity
  const issuesBySeverity = {
    blocker: report.issues.filter((i) => i.severity === "blocker"),
    high: report.issues.filter((i) => i.severity === "high"),
    medium: report.issues.filter((i) => i.severity === "medium"),
    low: report.issues.filter((i) => i.severity === "low"),
    nit: report.issues.filter((i) => i.severity === "nit"),
  };

  const lines: string[] = [
    `Fix these UI issues found on ${report.url} (current score: ${report.score}/100):`,
    ``,
  ];

  let issueNum = 1;
  for (const [severity, issues] of Object.entries(issuesBySeverity)) {
    if (issues.length === 0) continue;

    for (const issue of issues) {
      lines.push(`${issueNum}. [${severity.toUpperCase()}] ${issue.title}`);
      lines.push(`   Category: ${issue.category}`);
      lines.push(`   Problem: ${issue.actual}`);
      lines.push(`   Expected: ${issue.expected}`);
      lines.push(`   Fix: ${issue.suggestedFix}`);
      if (issue.reproSteps.length > 0) {
        lines.push(`   Repro steps: ${issue.reproSteps.join(" -> ")}`);
      }
      if (issue.evidence.length > 0) {
        lines.push(`   Screenshots: ${issue.evidence.join(", ")}`);
      }
      lines.push(``);
      issueNum++;
    }
  }

  // Summary
  const counts = [
    issuesBySeverity.blocker.length > 0 ? `${issuesBySeverity.blocker.length} blocker` : null,
    issuesBySeverity.high.length > 0 ? `${issuesBySeverity.high.length} high` : null,
    issuesBySeverity.medium.length > 0 ? `${issuesBySeverity.medium.length} medium` : null,
    issuesBySeverity.low.length > 0 ? `${issuesBySeverity.low.length} low` : null,
    issuesBySeverity.nit.length > 0 ? `${issuesBySeverity.nit.length} nit` : null,
  ].filter(Boolean);

  if (counts.length > 0) {
    lines.push(`Priority: ${counts.join(", ")} issue${report.issues.length === 1 ? "" : "s"} to fix.`);
  }

  const content = lines.join("\n");
  await writeFile(fixPath, content);
  return fixPath;
}
