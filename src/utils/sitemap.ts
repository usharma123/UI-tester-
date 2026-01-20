/**
 * Sitemap discovery utility
 * Fetches and parses sitemap.xml to discover all pages on a website
 */

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
 * Extract common page paths from a URL
 */
function getCommonPaths(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/$/, "");
  return [
    base,
    `${base}/about`,
    `${base}/about-us`,
    `${base}/contact`,
    `${base}/pricing`,
    `${base}/features`,
    `${base}/services`,
    `${base}/products`,
    `${base}/blog`,
    `${base}/news`,
    `${base}/faq`,
    `${base}/help`,
    `${base}/support`,
    `${base}/terms`,
    `${base}/privacy`,
    `${base}/team`,
    `${base}/careers`,
  ];
}

/**
 * Filter URLs to only include public, testable pages
 */
function filterPublicUrls(urls: SitemapUrl[], baseUrl: string): SitemapUrl[] {
  const baseHost = new URL(baseUrl).hostname;
  
  return urls.filter((url) => {
    try {
      const parsed = new URL(url.loc);
      
      // Must be same domain
      if (parsed.hostname !== baseHost) return false;
      
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
  
  // Helper to return common paths fallback
  const getCommonPathsFallback = (): SitemapResult => ({
    urls: getCommonPaths(base).map((loc) => ({ loc })),
    source: "crawled",
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
              return {
                urls: filtered.slice(0, 50), // Limit to 50 URLs
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
                  return {
                    urls: filtered.slice(0, 50),
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
    return getCommonPathsFallback();
  } catch (error) {
    // Complete failure - still return common paths so we have something to test
    return getCommonPathsFallback();
  } finally {
    clearTimeout(timeoutId);
  }
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
