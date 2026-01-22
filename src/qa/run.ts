import { join } from "node:path";
import type { Config } from "../config.js";
import type { RunContext, Report, Evidence, AuditEntry } from "./types.js";
import { createAgentBrowser, type AgentBrowser } from "../agentBrowser.js";
import { createPlan } from "./planner.js";
import { executePlan } from "./executor.js";
import { evaluateEvidence } from "./judge.js";
import { getViewportInfo, runDomAudit, trySetViewport } from "./audits.js";
import { writeJson, ensureDir, getRunDir } from "../utils/fs.js";
import { getTimestamp, formatDuration } from "../utils/time.js";

export interface RunResult {
  report: Report;
  evidence: Evidence;
  context: RunContext;
  duration: number;
}

export async function runQA(config: Config, url: string): Promise<RunResult> {
  const startTime = Date.now();
  const timestamp = getTimestamp();

  const context: RunContext = {
    url,
    goals: config.goals,
    maxSteps: config.maxSteps,
    timestamp,
    screenshotDir: getRunDir(config.screenshotDir, timestamp),
    reportDir: config.reportDir,
  };

  await ensureDir(context.screenshotDir);
  await ensureDir(context.reportDir);

  const browser = createAgentBrowser({
    timeout: config.browserTimeout,
    debug: process.env.DEBUG === "true",
  });

  let evidence: Evidence | null = null;
  let report: Report | null = null;
  const audits: AuditEntry[] = [];
  let initialScreenshot: string | null = null;

  try {
    console.log(`\n[QA] Starting test for: ${url}`);
    console.log(`[QA] Goals: ${config.goals}`);
    console.log(`[QA] Max steps: ${config.maxSteps}`);
    console.log(`[QA] Screenshots: ${context.screenshotDir}`);

    console.log("\n[QA] Phase 1: Opening URL and taking initial snapshot...");
    await browser.open(url);
    const initialSnapshot = await browser.snapshot();

    initialScreenshot = join(context.screenshotDir, "00-initial.png");
    await browser.screenshot(initialScreenshot);
    console.log(`[QA] Initial screenshot saved: ${initialScreenshot}`);

    if (config.auditsEnabled) {
      console.log("\n[QA] Phase 1b: Running DOM audits...");
      try {
        const originalViewport = await getViewportInfo(browser);
        let resizeSupported = true;

        for (const viewport of config.viewports) {
          try {
            const { applied } = await trySetViewport(browser, viewport.width, viewport.height);
            if (!applied) {
              resizeSupported = false;
              break;
            }
          } catch {
            resizeSupported = false;
            break;
          }

          try {
            const auditScreenshot = join(context.screenshotDir, `audit-${viewport.label}.png`);
            await browser.screenshot(auditScreenshot);
            const audit = await runDomAudit(browser, url, viewport.label);
            audits.push({ ...audit, screenshotPath: auditScreenshot });
          } catch (error) {
            console.warn(`[QA] Audit failed for ${viewport.label}: ${error}`);
          }
        }

        if (!resizeSupported) {
          console.warn("[QA] Viewport resize unsupported; falling back to default viewport audit.");
          const auditScreenshot = join(context.screenshotDir, "audit-default.png");
          await browser.screenshot(auditScreenshot);
          const audit = await runDomAudit(browser, url, "default");
          audits.push({ ...audit, screenshotPath: auditScreenshot });
        }

        await trySetViewport(browser, originalViewport.width, originalViewport.height);
      } catch (error) {
        console.warn(`[QA] DOM audits failed: ${error}`);
      }
    }

    console.log("\n[QA] Phase 2: Planning test steps...");
    const { plan } = await createPlan(config, url, config.goals, initialSnapshot);
    console.log(`[QA] Plan created with ${plan.steps.length} steps`);

    if (process.env.DEBUG === "true") {
      console.log("[QA] Plan:", JSON.stringify(plan, null, 2));
    }

    console.log("\n[QA] Phase 3: Executing test plan...");
    evidence = await executePlan(browser, plan, {
      screenshotDir: context.screenshotDir,
      maxSteps: config.maxSteps,
      strictMode: config.strictMode,
      captureBeforeAfterScreenshots: config.captureBeforeAfterScreenshots,
    });

    if (initialScreenshot) {
      evidence.screenshotMap[initialScreenshot] = -1;
    }
    if (audits.length > 0) {
      evidence.audits = audits;
      for (const audit of audits) {
        if (audit.screenshotPath) {
          evidence.screenshotMap[audit.screenshotPath] = -1;
        }
      }
    }

    const successCount = evidence.executedSteps.filter((s) => s.status === "success").length;
    const failedCount = evidence.executedSteps.filter((s) => s.status === "failed").length;
    const blockedCount = evidence.executedSteps.filter((s) => s.status === "blocked").length;

    console.log(`[QA] Execution complete: ${successCount} success, ${failedCount} failed, ${blockedCount} blocked`);

    const evidenceFilePath = join(context.reportDir, `${timestamp}-evidence.json`);
    await writeJson(evidenceFilePath, evidence);
    console.log(`[QA] Evidence saved: ${evidenceFilePath}`);

    console.log("\n[QA] Phase 4: Evaluating results...");
    const { report: evaluatedReport } = await evaluateEvidence(config, evidence, evidenceFilePath);
    report = evaluatedReport;

    const reportFilePath = join(context.reportDir, `${timestamp}-report.json`);
    await writeJson(reportFilePath, report);
    console.log(`[QA] Report saved: ${reportFilePath}`);

  } finally {
    console.log("\n[QA] Closing browser...");
    try {
      await browser.close();
    } catch (closeError) {
      console.warn("[QA] Warning: Failed to close browser cleanly:", closeError);
    }
  }

  const duration = Date.now() - startTime;
  console.log(`\n[QA] Test completed in ${formatDuration(duration)}`);

  if (!evidence || !report) {
    throw new Error("Test failed: no evidence or report generated");
  }

  return {
    report,
    evidence,
    context,
    duration,
  };
}

export function printReportSummary(result: RunResult): void {
  const { report } = result;

  console.log("\n" + "=".repeat(60));
  console.log("QA REPORT SUMMARY");
  console.log("=".repeat(60));

  console.log(`\nURL: ${report.url}`);
  console.log(`Score: ${report.score}/100`);
  console.log(`\nSummary: ${report.summary}`);

  console.log(`\nTested Flows:`);
  report.testedFlows.forEach((flow, i) => {
    console.log(`  ${i + 1}. ${flow}`);
  });

  if (report.issues.length > 0) {
    console.log(`\nTop Issues (${report.issues.length} total):`);
    const topIssues = report.issues.slice(0, 3);
    topIssues.forEach((issue, i) => {
      const severityEmoji = {
        blocker: "[!!!]",
        high: "[!!]",
        medium: "[!]",
        low: "[~]",
        nit: "[.]",
      }[issue.severity];
      console.log(`  ${i + 1}. ${severityEmoji} [${issue.category}] ${issue.title}`);
      console.log(`     ${issue.actual}`);
    });

    if (report.issues.length > 3) {
      console.log(`  ... and ${report.issues.length - 3} more issues`);
    }
  } else {
    console.log("\nNo issues found!");
  }

  console.log(`\nArtifacts:`);
  console.log(`  Screenshots: ${report.artifacts.screenshots.length} files`);
  console.log(`  Evidence: ${report.artifacts.evidenceFile}`);

  console.log("\n" + "=".repeat(60));
}
