/**
 * Sitemap discovery utility
 * Fetches and parses sitemap.xml to discover all pages on a website
 */

import type { AgentBrowser, LinkInfo } from "../agentBrowser.js";

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  priority?: number;
  changefreq?: string;
}

export interface SitemapResult {
  urls: SitemapUrl[];
  source: "sitemap.xml" | "robots.txt" | "crawled" | "none";
  error?: string;
}

/**
 * Parse XML sitemap content
 */
function parseXmlSitemap(xml: string): SitemapUrl[] {
  const urls: SitemapUrl[] = [];
  
  // Simple regex-based XML parsing for sitemap
  const urlRegex = /<url>([\s\S]*?)<\/url>/g;
  const locRegex = /<loc>(.*?)<\/loc>/;
  const lastmodRegex = /<lastmod>(.*?)<\/lastmod>/;
  const priorityRegex = /<priority>(.*?)<\/priority>/;
  const changefreqRegex = /<changefreq>(.*?)<\/changefreq>/;
  
  let match;
  while ((match = urlRegex.exec(xml)) !== null) {
    const urlBlock = match[1];
    const locMatch = locRegex.exec(urlBlock);
    
    if (locMatch) {
      const url: SitemapUrl = {
        loc: locMatch[1].trim(),
      };
      
      const lastmodMatch = lastmodRegex.exec(urlBlock);
      if (lastmodMatch) url.lastmod = lastmodMatch[1].trim();
      
      const priorityMatch = priorityRegex.exec(urlBlock);
      if (priorityMatch) url.priority = parseFloat(priorityMatch[1]);
      
      const changefreqMatch = changefreqRegex.exec(urlBlock);
      if (changefreqMatch) url.changefreq = changefreqMatch[1].trim();
      
      urls.push(url);
    }
  }
  
  // Also check for sitemap index (nested sitemaps)
  const sitemapIndexRegex = /<sitemap>([\s\S]*?)<\/sitemap>/g;
  while ((match = sitemapIndexRegex.exec(xml)) !== null) {
    const sitemapBlock = match[1];
    const locMatch = locRegex.exec(sitemapBlock);
    if (locMatch) {
      urls.push({ loc: locMatch[1].trim() });
    }
  }
  
  return urls;
}

/**
 * Parse robots.txt to find sitemap URLs
 */
function parseSitemapFromRobots(robotsTxt: string): string[] {
  const sitemaps: string[] = [];
  const lines = robotsTxt.split("\n");
  
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (trimmed.startsWith("sitemap:")) {
      const url = line.substring(line.indexOf(":") + 1).trim();
      if (url) sitemaps.push(url);
    }
  }
  
  return sitemaps;
}

/**
 * Get only the base URL as fallback (no fabricated pages)
 */
function getBaseUrlOnly(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/$/, "");
  return [base];
}

/**
 * Sort URLs by priority with homepage first
 * Higher priority URLs come first, homepage always at top
 */
function sortUrlsByPriority(urls: SitemapUrl[], baseUrl: string): SitemapUrl[] {
  const baseHost = new URL(baseUrl).hostname;

  return [...urls].sort((a, b) => {
    try {
      const pathA = new URL(a.loc).pathname;
      const pathB = new URL(b.loc).pathname;

      // Homepage always first
      const isHomeA = pathA === "/" || pathA === "";
      const isHomeB = pathB === "/" || pathB === "";

      if (isHomeA && !isHomeB) return -1;
      if (isHomeB && !isHomeA) return 1;

      // Then sort by priority (higher priority first)
      const priorityA = a.priority ?? 0.5;
      const priorityB = b.priority ?? 0.5;

      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }

      // Then by path depth (shallower paths first)
      const depthA = pathA.split("/").filter(Boolean).length;
      const depthB = pathB.split("/").filter(Boolean).length;

      return depthA - depthB;
    } catch {
      return 0;
    }
  });
}

/**
 * Filter URLs to only include public, testable pages
 */
function filterPublicUrls(urls: SitemapUrl[], baseUrl: string): SitemapUrl[] {
  const baseHost = normalizeHostname(new URL(baseUrl).hostname);

  return urls.filter((url) => {
    try {
      const parsed = new URL(url.loc);

      // Must be same domain (allow www/non-www variations)
      if (normalizeHostname(parsed.hostname) !== baseHost) return false;
      
      // Skip auth-related pages
      const path = parsed.pathname.toLowerCase();
      const skipPatterns = [
        "/login", "/signin", "/signup", "/register",
        "/auth", "/oauth", "/sso",
        "/admin", "/dashboard", "/account", "/profile", "/settings",
        "/api/", "/webhook", "/callback",
        "/logout", "/signout",
        ".pdf", ".jpg", ".png", ".gif", ".svg", ".xml", ".json",
      ];
      
      if (skipPatterns.some((p) => path.includes(p))) return false;
      
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Fetch sitemap for a website
 */
export async function fetchSitemap(baseUrl: string, timeoutMs = 10000): Promise<SitemapResult> {
  const base = baseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  // Helper to return base URL only fallback (no fabricated pages)
  const getBaseUrlFallback = (): SitemapResult => ({
    urls: getBaseUrlOnly(base).map((loc) => ({ loc })),
    source: "none",
  });
  
  try {
    // Try sitemap.xml first
    const sitemapUrls = [
      `${base}/sitemap.xml`,
      `${base}/sitemap_index.xml`,
      `${base}/sitemap-index.xml`,
    ];
    
    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await fetch(sitemapUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AXIOM-QA-Bot/1.0)" },
        });
        
        if (response.ok) {
          const xml = await response.text();
          let urls = parseXmlSitemap(xml);
          
          // If it's a sitemap index, fetch child sitemaps
          if (urls.length > 0 && urls.every((u) => u.loc.endsWith(".xml"))) {
            const childUrls: SitemapUrl[] = [];
            for (const indexUrl of urls.slice(0, 3)) { // Limit to 3 child sitemaps
              try {
                const childResponse = await fetch(indexUrl.loc, {
                  signal: controller.signal,
                  headers: { "User-Agent": "Mozilla/5.0 (compatible; AXIOM-QA-Bot/1.0)" },
                });
                if (childResponse.ok) {
                  const childXml = await childResponse.text();
                  childUrls.push(...parseXmlSitemap(childXml));
                }
              } catch {
                // Skip failed child sitemaps
              }
            }
            urls = childUrls;
          }
          
          if (urls.length > 0) {
            const filtered = filterPublicUrls(urls, base);
            if (filtered.length > 0) {
              const sorted = sortUrlsByPriority(filtered, base);
              return {
                urls: sorted.slice(0, 50), // Limit to 50 URLs
                source: "sitemap.xml",
              };
            }
          }
        }
      } catch {
        // Try next sitemap URL
      }
    }
    
    // Try robots.txt for sitemap references
    try {
      const robotsResponse = await fetch(`${base}/robots.txt`, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AXIOM-QA-Bot/1.0)" },
      });
      
      if (robotsResponse.ok) {
        const robotsTxt = await robotsResponse.text();
        const robotsSitemapUrls = parseSitemapFromRobots(robotsTxt);
        
        for (const sitemapUrl of robotsSitemapUrls.slice(0, 2)) {
          try {
            const sitemapResponse = await fetch(sitemapUrl, {
              signal: controller.signal,
              headers: { "User-Agent": "Mozilla/5.0 (compatible; AXIOM-QA-Bot/1.0)" },
            });
            
            if (sitemapResponse.ok) {
              const xml = await sitemapResponse.text();
              const urls = parseXmlSitemap(xml);
              if (urls.length > 0) {
                const filtered = filterPublicUrls(urls, base);
                if (filtered.length > 0) {
                  const sorted = sortUrlsByPriority(filtered, base);
                  return {
                    urls: sorted.slice(0, 50),
                    source: "robots.txt",
                  };
                }
              }
            }
          } catch {
            // Skip failed sitemap
          }
        }
      }
    } catch {
      // Robots.txt not available
    }
    
    // Fallback: Return common paths to try
    return getBaseUrlFallback();
  } catch (error) {
    // Complete failure - still return common paths so we have something to test
    return getBaseUrlFallback();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * URL patterns to skip during link crawling
 */
const SKIP_PATTERNS = [
  // Auth pages
  "/login", "/signin", "/signup", "/register", "/auth", "/oauth",
  "/admin", "/dashboard", "/account", "/profile", "/settings",
  "/logout", "/signout", "/sso",
  // Non-HTML file extensions
  ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp",
  ".zip", ".tar", ".gz", ".exe", ".dmg",
  ".xml", ".json", ".rss", ".atom",
  ".css", ".js", ".woff", ".woff2", ".ttf", ".eot",
  // API/system paths
  "/api/", "/webhook", "/callback", "/_next/", "/_nuxt/",
  // External protocols
  "javascript:", "mailto:", "tel:", "data:",
];

/**
 * Check if a URL should be skipped during crawling
 */
function shouldSkipUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return SKIP_PATTERNS.some((pattern) => lowerUrl.includes(pattern));
}

/**
 * Normalize a URL for deduplication
 * Removes trailing slashes, fragments, and common query params
 */
function normalizeUrlForDedup(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove fragment
    parsed.hash = "";
    // Remove common tracking params
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "ref", "source"];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));
    // Normalize path (remove trailing slash except for root)
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Normalize hostname for comparison (handle www/non-www)
 */
function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./, "").toLowerCase();
}

/**
 * Filter and deduplicate discovered links
 */
function filterDiscoveredLinks(links: LinkInfo[], baseUrl: string): string[] {
  const baseHost = normalizeHostname(new URL(baseUrl).hostname);
  const seen = new Set<string>();
  const filtered: string[] = [];

  for (const link of links) {
    try {
      const parsed = new URL(link.href);

      // Must be same domain (allow www/non-www variations)
      if (normalizeHostname(parsed.hostname) !== baseHost) continue;

      // Must be http/https
      if (!["http:", "https:"].includes(parsed.protocol)) continue;

      // Skip auth/file/system URLs
      if (shouldSkipUrl(link.href)) continue;

      // Skip hash-only links
      if (parsed.pathname === "/" && parsed.hash && !parsed.search) continue;

      // Normalize and deduplicate
      const normalized = normalizeUrlForDedup(link.href);
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      filtered.push(normalized);
    } catch {
      // Skip invalid URLs
    }
  }

  return filtered;
}

/**
 * Dynamically discover pages by crawling links from the current page
 * Used as fallback when sitemap.xml is not available
 */
export async function crawlSitemap(
  browser: AgentBrowser,
  baseUrl: string,
  maxPages: number = 20,
  maxDepth: number = 2
): Promise<SitemapResult> {
  const base = baseUrl.replace(/\/$/, "");
  const baseHost = new URL(base).hostname;

  // Track discovered URLs and their depths
  const discovered = new Map<string, number>(); // url -> depth discovered at
  const toVisit: Array<{ url: string; depth: number }> = [];

  // Start with the current page (homepage)
  const normalizedBase = normalizeUrlForDedup(base);
  discovered.set(normalizedBase, 0);

  try {
    // Get links from the current page (already opened by caller)
    const initialLinks = await browser.getLinks();
    const filteredLinks = filterDiscoveredLinks(initialLinks, base);

    // Add discovered links to our collection
    for (const url of filteredLinks) {
      if (!discovered.has(url) && discovered.size < maxPages) {
        discovered.set(url, 1);
        if (maxDepth > 1) {
          toVisit.push({ url, depth: 1 });
        }
      }
    }

    // Crawl additional pages if depth > 1 and we haven't hit maxPages
    while (toVisit.length > 0 && discovered.size < maxPages) {
      const { url, depth } = toVisit.shift()!;

      // Don't go deeper than maxDepth
      if (depth >= maxDepth) continue;

      try {
        // Navigate to the page
        await browser.open(url);

        // Get links from this page
        const pageLinks = await browser.getLinks();
        const newLinks = filterDiscoveredLinks(pageLinks, base);

        // Add new discoveries
        for (const newUrl of newLinks) {
          if (!discovered.has(newUrl) && discovered.size < maxPages) {
            discovered.set(newUrl, depth + 1);
            if (depth + 1 < maxDepth) {
              toVisit.push({ url: newUrl, depth: depth + 1 });
            }
          }
        }
      } catch {
        // Skip pages that fail to load
      }
    }
  } catch (error) {
    // If initial crawl fails, just return the base URL
    if (discovered.size === 0) {
      discovered.set(normalizedBase, 0);
    }
  }

  // Convert to SitemapUrl array with priorities based on depth
  const urls: SitemapUrl[] = Array.from(discovered.entries()).map(([loc, depth]) => ({
    loc,
    priority: Math.max(0.1, 1.0 - depth * 0.3), // Higher priority for shallower pages
  }));

  // Sort by priority (homepage first, then by depth)
  const sorted = sortUrlsByPriority(urls, base);

  return {
    urls: sorted.slice(0, maxPages),
    source: "crawled",
  };
}

/**
 * Format sitemap for display and planning
 */
export function formatSitemapForPlanner(sitemap: SitemapResult): string {
  if (sitemap.urls.length === 0) {
    return "No sitemap found. Test the homepage and visible navigation links.";
  }
  
  const lines = [
    `Found ${sitemap.urls.length} pages (source: ${sitemap.source}):`,
    "",
  ];
  
  // Group by path depth
  const byDepth: Record<number, SitemapUrl[]> = {};
  for (const url of sitemap.urls) {
    try {
      const path = new URL(url.loc).pathname;
      const depth = path.split("/").filter(Boolean).length;
      if (!byDepth[depth]) byDepth[depth] = [];
      byDepth[depth].push(url);
    } catch {
      // Skip invalid URLs
    }
  }
  
  // List URLs by depth (top-level first)
  for (const depth of Object.keys(byDepth).map(Number).sort()) {
    for (const url of byDepth[depth].slice(0, 10)) {
      const path = new URL(url.loc).pathname || "/";
      const priority = url.priority ? ` (priority: ${url.priority})` : "";
      lines.push(`- ${path}${priority}`);
    }
  }
  
  if (sitemap.urls.length > 20) {
    lines.push(`... and ${sitemap.urls.length - 20} more pages`);
  }
  
  return lines.join("\n");
}
