import { join } from "node:path";
import type { Config } from "../../config.js";
import type { AgentBrowser } from "../../agentBrowser.js";
import type { ProgressCallback } from "../progress-types.js";
import type { AuditEntry } from "../types.js";
import { emit, emitPhaseStart, emitPhaseComplete } from "../../core/events/emit.js";
import { getViewportInfo, runDomAudit, trySetViewport } from "../audits.js";

export interface InitPhaseOptions {
  browser: AgentBrowser;
  config: Config;
  url: string;
  screenshotDir: string;
  onProgress: ProgressCallback;
  saveAndEmitScreenshot: (localPath: string, stepIndex: number, label: string) => Promise<string>;
}

export interface InitPhaseResult {
  initialSnapshot: string;
  initialScreenshotPath: string;
  runAudits: AuditEntry[];
}

export async function runInitPhase(options: InitPhaseOptions): Promise<InitPhaseResult> {
  const { browser, config, url, screenshotDir, onProgress, saveAndEmitScreenshot } = options;

  emitPhaseStart(onProgress, "init");
  emit(onProgress, { type: "log", message: `Opening URL: ${url}`, level: "info" });

  await browser.open(url);
  const initialSnapshot = await browser.snapshot();

  const initialScreenshotPath = join(screenshotDir, "00-initial.png");
  await browser.screenshot(initialScreenshotPath);
  await saveAndEmitScreenshot(initialScreenshotPath, -1, "Initial page load");

  const runAudits: AuditEntry[] = [];

  if (config.auditsEnabled) {
    emit(onProgress, { type: "log", message: "Running DOM audits...", level: "info" });
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
          const auditScreenshot = join(screenshotDir, `audit-${viewport.label}.png`);
          await browser.screenshot(auditScreenshot);
          await saveAndEmitScreenshot(auditScreenshot, -1, `Audit ${viewport.label}`);
          const audit = await runDomAudit(browser, url, viewport.label);
          runAudits.push({ ...audit, screenshotPath: auditScreenshot });
        } catch (error) {
          emit(onProgress, {
            type: "log",
            message: `Audit failed for ${viewport.label}: ${error}`,
            level: "warn",
          });
        }
      }

      if (!resizeSupported) {
        emit(onProgress, {
          type: "log",
          message: "Viewport resize unsupported; falling back to default audit.",
          level: "warn",
        });
        const auditScreenshot = join(screenshotDir, "audit-default.png");
        await browser.screenshot(auditScreenshot);
        await saveAndEmitScreenshot(auditScreenshot, -1, "Audit default");
        const audit = await runDomAudit(browser, url, "default");
        runAudits.push({ ...audit, screenshotPath: auditScreenshot });
      }

      await trySetViewport(browser, originalViewport.width, originalViewport.height);
    } catch (error) {
      emit(onProgress, {
        type: "log",
        message: `DOM audits failed: ${error}`,
        level: "warn",
      });
    }
  }

  emitPhaseComplete(onProgress, "init");

  return {
    initialSnapshot,
    initialScreenshotPath,
    runAudits,
  };
}
