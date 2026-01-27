import { chromium, type Browser, type Page, type BrowserContext } from "playwright";

export interface AgentBrowserOptions {
  timeout?: number;
  navigationTimeout?: number;
  actionTimeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  debug?: boolean;
  headless?: boolean;
}

// Helper to sleep for a given duration
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (timeout, network, or navigation errors)
 */
export function isRetryableError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("net::") ||
    msg.includes("navigation") ||
    msg.includes("target closed") ||
    msg.includes("connection refused") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused")
  );
}

export interface LinkInfo {
  href: string;
  text: string;
}

export interface AgentBrowser {
  open(url: string): Promise<void>;
  snapshot(): Promise<string>;
  click(refOrSelector: string): Promise<void>;
  fill(refOrSelector: string, text: string): Promise<void>;
  press(key: string): Promise<void>;
  getText(refOrSelector: string): Promise<string>;
  screenshot(path: string): Promise<void>;
  eval(script: string): Promise<string>;
  evalJson<T>(script: string): Promise<T>;
  getLinks(): Promise<LinkInfo[]>;
  setViewportSize(width: number, height: number): Promise<void>;
  close(): Promise<void>;
}

const DEFAULT_TIMEOUT = 30000;

/**
 * Convert our selector format to Playwright-compatible selector
 * Supports: text:Button, a:Link, button:Submit, role=..., CSS selectors
 */
function normalizeSelector(selector: string): string {
  // Skip @e refs - they're not supported
  if (selector.startsWith("@e")) {
    throw new Error(`Element refs like "${selector}" are not supported. Use text or CSS selectors instead.`);
  }

  // text:Button Text -> text=Button Text
  if (selector.startsWith("text:")) {
    return `text=${selector.slice(5)}`;
  }

  // a:Link Text -> a:has-text("Link Text")
  if (selector.startsWith("a:")) {
    const linkText = selector.slice(2);
    return `a:has-text("${linkText}")`;
  }

  // button:Submit -> button:has-text("Submit")
  if (selector.startsWith("button:")) {
    const buttonText = selector.slice(7);
    return `button:has-text("${buttonText}")`;
  }

  // label:Email -> text=Email (will find the label, then we can interact with associated input)
  if (selector.startsWith("label:")) {
    return `text=${selector.slice(6)}`;
  }

  // role=button[name="..."] - pass through as-is (Playwright format)
  if (selector.startsWith("role=")) {
    return selector;
  }

  // Regular CSS selector - pass through
  return selector;
}

/**
 * Run an async operation with retry logic and exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  options: AgentBrowserOptions = {},
  maxRetries?: number,
  initialDelayMs?: number
): Promise<T> {
  const retries = maxRetries ?? options.maxRetries ?? 3;
  const delayMs = initialDelayMs ?? options.retryDelayMs ?? 1000;

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on retryable errors and if we have retries left
      if (isRetryableError(lastError) && attempt < retries) {
        const delay = delayMs * Math.pow(2, attempt);
        if (options.debug) {
          console.log(`[playwright] Retry ${attempt + 1}/${retries} after ${delay}ms: ${lastError.message}`);
        }
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError;
}

// Script to run in browser context for generating DOM snapshot
const SNAPSHOT_SCRIPT = `
(function() {
  function getElementInfo(el, depth) {
    var indent = "  ".repeat(depth);
    var tag = el.tagName.toLowerCase();
    var text = (el.textContent || "").trim().slice(0, 100);
    var role = el.getAttribute("role") || "";
    var ariaLabel = el.getAttribute("aria-label") || "";

    var info = indent + "<" + tag;
    if (role) info += ' role="' + role + '"';
    if (ariaLabel) info += ' aria-label="' + ariaLabel + '"';
    if (el.tagName === "INPUT") {
      info += ' type="' + el.type + '" name="' + el.name + '"';
      if (el.placeholder) info += ' placeholder="' + el.placeholder + '"';
    }
    if (el.tagName === "A" && el.href) {
      info += ' href="' + el.href + '"';
    }
    if (el.tagName === "BUTTON") {
      info += ' type="' + (el.type || "button") + '"';
    }
    info += ">";

    if (text && el.children.length === 0) {
      info += " " + text.slice(0, 50);
    }

    return info;
  }

  function walkDOM(node, depth) {
    var lines = [];
    var interactiveTags = ["a", "button", "input", "select", "textarea", "form", "nav", "main", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6"];
    var tag = node.tagName ? node.tagName.toLowerCase() : "";

    if (interactiveTags.indexOf(tag) !== -1 || node.getAttribute && node.getAttribute("role")) {
      lines.push(getElementInfo(node, depth || 0));
    }

    var children = node.children ? Array.from(node.children) : [];
    for (var i = 0; i < children.length; i++) {
      var childLines = walkDOM(children[i], (depth || 0) + 1);
      for (var j = 0; j < childLines.length; j++) {
        lines.push(childLines[j]);
      }
    }

    return lines;
  }

  return walkDOM(document.body, 0).join("\\n");
})()
`;

/**
 * Generate a DOM snapshot of the page focusing on interactive elements
 */
async function generateSnapshot(page: Page): Promise<string> {
  return await page.evaluate(SNAPSHOT_SCRIPT);
}

export function createAgentBrowser(options: AgentBrowserOptions = {}): AgentBrowser {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  const defaultTimeout = options.timeout ?? DEFAULT_TIMEOUT;
  const navigationTimeout = options.navigationTimeout ?? defaultTimeout;
  const actionTimeout = options.actionTimeout ?? defaultTimeout;
  const headless = options.headless ?? true;

  const ensurePage = async (): Promise<Page> => {
    if (!browser) {
      browser = await chromium.launch({
        headless,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ],
      });
    }

    if (!context) {
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
    }

    if (!page) {
      page = await context.newPage();
      page.setDefaultTimeout(defaultTimeout);
      page.setDefaultNavigationTimeout(navigationTimeout);
    }

    return page;
  };

  return {
    async open(url: string): Promise<void> {
      await withRetry(async () => {
        const p = await ensurePage();
        await p.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: navigationTimeout
        });
        // Wait a bit for dynamic content
        await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      }, options);

      if (options.debug) {
        console.log(`[playwright] Opened: ${url}`);
      }
    },

    async snapshot(): Promise<string> {
      return withRetry(async () => {
        const p = await ensurePage();
        return generateSnapshot(p);
      }, options);
    },

    async click(selector: string): Promise<void> {
      const normalizedSelector = normalizeSelector(selector);
      await withRetry(async () => {
        const p = await ensurePage();
        await p.click(normalizedSelector, { timeout: actionTimeout });
      }, options, 1);

      if (options.debug) {
        console.log(`[playwright] Clicked: ${selector}`);
      }
    },

    async fill(selector: string, text: string): Promise<void> {
      const normalizedSelector = normalizeSelector(selector);
      await withRetry(async () => {
        const p = await ensurePage();
        await p.fill(normalizedSelector, text, { timeout: actionTimeout });
      }, options, 1);

      if (options.debug) {
        console.log(`[playwright] Filled: ${selector} with "${text}"`);
      }
    },

    async press(key: string): Promise<void> {
      const p = await ensurePage();
      await p.keyboard.press(key);

      if (options.debug) {
        console.log(`[playwright] Pressed: ${key}`);
      }
    },

    async getText(selector: string): Promise<string> {
      const normalizedSelector = normalizeSelector(selector);
      const p = await ensurePage();
      const text = await p.textContent(normalizedSelector, { timeout: actionTimeout });
      return text || "";
    },

    async screenshot(path: string): Promise<void> {
      await withRetry(async () => {
        const p = await ensurePage();
        await p.screenshot({ path, fullPage: false });
      }, options, 2);

      if (options.debug) {
        console.log(`[playwright] Screenshot saved: ${path}`);
      }
    },

    async eval(script: string): Promise<string> {
      return withRetry(async () => {
        const p = await ensurePage();
        const result = await p.evaluate(script);
        return typeof result === "string" ? result : JSON.stringify(result);
      }, options, 1);
    },

    async evalJson<T>(script: string): Promise<T> {
      return withRetry(async () => {
        const p = await ensurePage();
        const result = await p.evaluate(script);
        return result as T;
      }, options, 1);
    },

    async getLinks(): Promise<LinkInfo[]> {
      try {
        const p = await ensurePage();
        return await p.evaluate(() => {
          return Array.from(document.querySelectorAll("a[href]")).map((a) => ({
            href: (a as HTMLAnchorElement).href,
            text: (a.textContent || "").trim().slice(0, 100),
          }));
        });
      } catch (error) {
        if (options.debug) {
          console.log(`[playwright] getLinks failed: ${error}`);
        }
        return [];
      }
    },

    async setViewportSize(width: number, height: number): Promise<void> {
      const p = await ensurePage();
      await p.setViewportSize({ width, height });

      if (options.debug) {
        console.log(`[playwright] Viewport set to: ${width}x${height}`);
      }
    },

    async close(): Promise<void> {
      if (page) {
        await page.close().catch(() => {});
        page = null;
      }
      if (context) {
        await context.close().catch(() => {});
        context = null;
      }
      if (browser) {
        await browser.close().catch(() => {});
        browser = null;
      }

      if (options.debug) {
        console.log("[playwright] Browser closed");
      }
    },
  };
}

export type { AgentBrowserOptions as BrowserOptions };
