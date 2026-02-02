import { join } from "node:path";
import type { ProgressCallback } from "../../qa/progress-types.js";
import type { SitemapResult } from "../../utils/sitemap.js";
import { emit, emitValidationPhaseStart, emitValidationPhaseComplete } from "../../core/events/emit.js";
import { fetchSitemap, crawlSitemap } from "../../utils/sitemap.js";
import { createAgentBrowser, type AgentBrowser } from "../../agentBrowser.js";
import type { ValidationConfig } from "../types.js";
import type { TestExecutionSummary } from "../cross-validator.js";

export interface DiscoveryPhaseOptions {
  config: ValidationConfig;
  onProgress: ProgressCallback;
  screenshotDir: string;
  testExecution: TestExecutionSummary;
}

export interface DiscoveryPhaseResult {
  browser: AgentBrowser;
  initialSnapshot: string;
  sitemap: SitemapResult;
}

export async function runDiscoveryPhase(options: DiscoveryPhaseOptions): Promise<DiscoveryPhaseResult> {
  const { config, onProgress, screenshotDir, testExecution } = options;

  emitValidationPhaseStart(onProgress, "discovery");
  emit(onProgress, {
    type: "log",
    message: "Discovering site structure...",
    level: "info",
  });

  const browser = createAgentBrowser({
    timeout: config.browserTimeout,
    navigationTimeout: config.navigationTimeout,
    actionTimeout: config.actionTimeout,
    maxRetries: 3,
    retryDelayMs: 1000,
    debug: process.env.DEBUG === "true",
  });

  await browser.open(config.url);
  const initialSnapshot = await browser.snapshot();
  testExecution.pagesVisited.push(config.url);

  const initialScreenshot = join(screenshotDir, "00-initial.png");
  await browser.screenshot(initialScreenshot);
  testExecution.screenshots.push(initialScreenshot);

  let sitemap: SitemapResult;
  try {
    sitemap = await fetchSitemap(config.url, 15000);
    if (sitemap.urls.length < 3) {
      const crawled = await crawlSitemap(browser, config.url, config.maxPages);
      if (crawled.urls.length > sitemap.urls.length) {
        sitemap = crawled;
      }
    }
  } catch {
    sitemap = { urls: [{ loc: config.url }], source: "none" };
  }

  emit(onProgress, {
    type: "sitemap",
    urls: sitemap.urls.map((u) => ({
      loc: u.loc,
      lastmod: u.lastmod,
      priority: u.priority,
    })),
    source: sitemap.source,
    totalPages: sitemap.urls.length,
  });

  emitValidationPhaseComplete(onProgress, "discovery");

  return { browser, initialSnapshot, sitemap };
}
