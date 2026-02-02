import type { Config } from "../../config.js";
import type { AgentBrowser } from "../../agentBrowser.js";
import type { ProgressCallback } from "../progress-types.js";
import { emit, emitPhaseStart, emitPhaseComplete } from "../../core/events/emit.js";
import { fetchSitemap, crawlSitemap, type SitemapResult } from "../../utils/sitemap.js";

export interface DiscoveryPhaseOptions {
  browser: AgentBrowser;
  config: Config;
  url: string;
  onProgress: ProgressCallback;
}

export async function runDiscoveryPhase(options: DiscoveryPhaseOptions): Promise<SitemapResult> {
  const { browser, config, url, onProgress } = options;

  emitPhaseStart(onProgress, "discovery");
  emit(onProgress, { type: "log", message: "Discovering site structure...", level: "info" });

  let sitemap: SitemapResult;
  try {
    sitemap = await fetchSitemap(url, 15000);

    emit(onProgress, {
      type: "log",
      message: `Static discovery found ${sitemap.urls.length} pages via ${sitemap.source}`,
      level: "info",
    });

    if (sitemap.urls.length < 3) {
      emit(onProgress, {
        type: "log",
        message: "Few pages found, crawling links for more...",
        level: "info",
      });

      try {
        const crawledSitemap = await crawlSitemap(browser, url, config.maxPages);

        if (crawledSitemap.urls.length > sitemap.urls.length) {
          emit(onProgress, {
            type: "log",
            message: `Link crawling found ${crawledSitemap.urls.length} pages`,
            level: "info",
          });
          sitemap = crawledSitemap;
        }
      } catch (crawlError) {
        emit(onProgress, {
          type: "log",
          message: `Link crawling failed: ${crawlError}`,
          level: "warn",
        });
      }
    }

    if (sitemap.urls.length === 0) {
      const baseUrl = url.replace(/\/$/, "");
      sitemap = {
        urls: [{ loc: baseUrl }],
        source: "none",
      };
      emit(onProgress, {
        type: "log",
        message: "No pages discovered, testing homepage only",
        level: "info",
      });
    }

    emit(onProgress, {
      type: "sitemap",
      urls: sitemap.urls.map((u) => ({ loc: u.loc, lastmod: u.lastmod, priority: u.priority })),
      source: sitemap.source,
      totalPages: sitemap.urls.length,
    });
    emit(onProgress, {
      type: "log",
      message: `Final discovery: ${sitemap.urls.length} pages via ${sitemap.source}`,
      level: "info",
    });
  } catch (error) {
    emit(onProgress, {
      type: "log",
      message: `Sitemap discovery failed: ${error}`,
      level: "warn",
    });
    sitemap = { urls: [{ loc: url }], source: "none" };
  }

  emitPhaseComplete(onProgress, "discovery");

  return sitemap;
}
