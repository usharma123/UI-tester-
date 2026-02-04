import { chromium, type Browser, type Page, type BrowserContext } from "playwright";

export interface AgentBrowserOptions {
  timeout?: number;
  navigationTimeout?: number;
  actionTimeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  debug?: boolean;
  headless?: boolean;
  /** Time to wait for DOM stability before considering page stable (default: 300ms) */
  stabilityWindowMs?: number;
  /** Interval to check for DOM changes during stability wait (default: 100ms) */
  stabilityCheckIntervalMs?: number;
  /** Maximum time to wait for stability (default: 5000ms) */
  maxStabilityWaitMs?: number;
}

// ============================================================================
// Actionability Types
// ============================================================================

export type ActionabilityIssueType =
  | "not_visible"
  | "disabled"
  | "aria_busy"
  | "bbox_unstable"
  | "covered"
  | "outside_viewport"
  | "detached";

export interface ActionabilityIssue {
  type: ActionabilityIssueType;
  details: string;
}

export interface ActionabilityResult {
  isActionable: boolean;
  issues: ActionabilityIssue[];
  confidence: number; // 0-1
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// ============================================================================
// Action Outcome Types
// ============================================================================

export type ActionOutcomeType =
  | "url_changed"
  | "network_request"
  | "dom_changed"
  | "dialog_opened"
  | "console_error"
  | "no_change"
  | "element_not_hydrated";

export interface ActionOutcome {
  type: ActionOutcomeType;
  details: string;
  success: boolean;
}

export interface ElementMeta {
  tagName: string;
  href?: string;
  target?: string;
  role?: string;
  ariaExpanded?: string;
  ariaPressed?: string;
  ariaChecked?: string;
  dataState?: string;
  className?: string;
  id?: string;
  text?: string;
}

// ============================================================================
// Stability Types
// ============================================================================

export interface StabilityResult {
  isStable: boolean;
  waitedMs: number;
  reason: "stable" | "timeout" | "error";
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
  hover(refOrSelector: string): Promise<void>;
  getText(refOrSelector: string): Promise<string>;
  screenshot(path: string): Promise<void>;
  eval(script: string): Promise<string>;
  evalJson<T>(script: string): Promise<T>;
  getLinks(): Promise<LinkInfo[]>;
  setViewportSize(width: number, height: number): Promise<void>;
  close(): Promise<void>;
  getElementMeta(selector: string): Promise<ElementMeta | null>;
  /** Check if an element is actionable (visible, enabled, not covered) */
  checkActionability(selector: string): Promise<ActionabilityResult>;
  /** Wait for the page to be stable (no DOM mutations) */
  waitForStability(options?: { maxWaitMs?: number; windowMs?: number }): Promise<StabilityResult>;
  /** Detect the outcome of an action based on page changes */
  detectActionOutcome(beforeSnapshot: PageSnapshot, afterSnapshot: PageSnapshot): ActionOutcome;
  /** Get current page URL */
  getCurrentUrl(): Promise<string>;
  /** Take a page snapshot for comparison (URL, DOM hash, dialog count, etc.) */
  takePageSnapshot(): Promise<PageSnapshot>;
}

export interface PageSnapshot {
  url: string;
  domHash: string;
  elementCount: number;
  textLength: number;
  dialogCount: number;
  scrollX: number;
  scrollY: number;
  htmlClass: string;
  bodyClass: string;
  htmlDataTheme: string;
  bodyDataTheme: string;
  timestamp: number;
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

  // Already a Playwright selector
  if (
    selector.startsWith("text=") ||
    selector.startsWith("role=") ||
    selector.startsWith("css=") ||
    selector.startsWith("xpath=") ||
    selector.includes(":has-text(")
  ) {
    return selector;
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

    var includeText = false;
    if (text) {
      var textTags = ["a", "button", "label", "h1", "h2", "h3", "h4", "h5", "h6"];
      if (textTags.indexOf(tag) !== -1) {
        includeText = true;
      } else if (el.getAttribute && el.getAttribute("role")) {
        includeText = true;
      }
    }

    if (includeText) {
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

// Script to check element actionability
function buildActionabilityScript(selector: string): string {
  return `
(function() {
  const sel = ${JSON.stringify(selector)};
  const result = {
    isActionable: false,
    issues: [],
    confidence: 0,
    boundingBox: null
  };
  
  try {
    // Find the element
    let el;
    if (sel.startsWith('text=')) {
      const text = sel.slice(5);
      el = Array.from(document.querySelectorAll('*')).find(e => 
        e.textContent && e.textContent.trim().includes(text) && 
        ['A', 'BUTTON', 'INPUT', 'LABEL'].includes(e.tagName)
      );
    } else {
      el = document.querySelector(sel);
    }
    
    if (!el) {
      result.issues.push({ type: 'detached', details: 'Element not found in DOM' });
      return JSON.stringify(result);
    }
    
    // Get bounding box
    const rect = el.getBoundingClientRect();
    result.boundingBox = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    };
    
    // Check visibility
    const style = window.getComputedStyle(el);
    if (style.display === 'none') {
      result.issues.push({ type: 'not_visible', details: 'Element has display: none' });
    }
    if (style.visibility === 'hidden') {
      result.issues.push({ type: 'not_visible', details: 'Element has visibility: hidden' });
    }
    if (parseFloat(style.opacity) === 0) {
      result.issues.push({ type: 'not_visible', details: 'Element has opacity: 0' });
    }
    if (rect.width === 0 || rect.height === 0) {
      result.issues.push({ type: 'not_visible', details: 'Element has zero dimensions' });
    }
    
    // Check if outside viewport
    if (rect.bottom < 0 || rect.top > window.innerHeight ||
        rect.right < 0 || rect.left > window.innerWidth) {
      result.issues.push({ type: 'outside_viewport', details: 'Element is outside visible viewport' });
    }
    
    // Check disabled state
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
      result.issues.push({ type: 'disabled', details: 'Element is disabled' });
    }
    
    // Check aria-busy
    if (el.getAttribute('aria-busy') === 'true' || 
        el.closest('[aria-busy="true"]')) {
      result.issues.push({ type: 'aria_busy', details: 'Element or ancestor has aria-busy="true"' });
    }
    
    // Check if covered by another element
    if (rect.width > 0 && rect.height > 0) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const topEl = document.elementFromPoint(centerX, centerY);
      if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
        // Check if the covering element is interactive
        const coveringStyle = window.getComputedStyle(topEl);
        if (coveringStyle.pointerEvents !== 'none') {
          result.issues.push({ 
            type: 'covered', 
            details: 'Element is covered by: ' + topEl.tagName.toLowerCase() + 
                     (topEl.className ? '.' + topEl.className.split(' ')[0] : '')
          });
        }
      }
    }
    
    // Calculate confidence
    result.isActionable = result.issues.length === 0;
    result.confidence = result.isActionable ? 1 : Math.max(0, 1 - (result.issues.length * 0.25));
    
  } catch (e) {
    result.issues.push({ type: 'detached', details: 'Error checking element: ' + e.message });
  }
  
  return JSON.stringify(result);
})()
`;
}

// Script to get page snapshot for comparison
const PAGE_SNAPSHOT_SCRIPT = `
(function() {
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
  
  const body = document.body;
  const elementCount = body.querySelectorAll('*').length;
  const textLength = (body.textContent || '').length;
  
  // Count dialogs/modals
  const dialogs = document.querySelectorAll(
    'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'
  );
  const visibleDialogs = Array.from(dialogs).filter(d => {
    const style = window.getComputedStyle(d);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  
  // Create a simple DOM structure hash
  const tags = Array.from(body.querySelectorAll('*')).slice(0, 500)
    .map(el => el.tagName + (el.id ? '#' + el.id : '')).join(',');
  const domHash = simpleHash(tags);
  
  const html = document.documentElement;
  const bodyClass = body ? (body.className || '') : '';
  const htmlClass = html ? (html.className || '') : '';
  const bodyDataTheme = body ? (body.getAttribute('data-theme') || '') : '';
  const htmlDataTheme = html ? (html.getAttribute('data-theme') || '') : '';
  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;

  return JSON.stringify({
    url: window.location.href,
    domHash: domHash,
    elementCount: elementCount,
    textLength: textLength,
    dialogCount: visibleDialogs.length,
    scrollX: scrollX,
    scrollY: scrollY,
    htmlClass: htmlClass,
    bodyClass: bodyClass,
    htmlDataTheme: htmlDataTheme,
    bodyDataTheme: bodyDataTheme,
    timestamp: Date.now()
  });
})()
`;

// Script for DOM stability detection
const STABILITY_HASH_SCRIPT = `
(function() {
  const body = document.body;
  const count = body ? body.querySelectorAll('*').length : 0;
  const text = body ? (body.textContent || '').length : 0;
  const dialogs = document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]').length;
  return count + '-' + text + '-' + dialogs;
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
        const popupPromise = p.waitForEvent("popup", { timeout: 1500 }).catch(() => null);
        await p.click(normalizedSelector, { timeout: actionTimeout });
        const popup = await popupPromise;
        if (popup) {
          page = popup;
          page.setDefaultTimeout(defaultTimeout);
          page.setDefaultNavigationTimeout(navigationTimeout);
          await page.waitForLoadState("domcontentloaded", { timeout: navigationTimeout }).catch(() => {});
          await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        }
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
          const elements = Array.from(
            document.querySelectorAll(
              "a[href], [data-href], [data-url], [role='link'][href], [role='link'][data-href], [role='link'][data-url], button[data-href], button[data-url]"
            )
          );

          const links: Array<{ href: string; text: string }> = [];
          for (const el of elements) {
            const raw =
              (el.getAttribute && (el.getAttribute("href") || el.getAttribute("data-href") || el.getAttribute("data-url"))) ||
              "";
            const href = raw.trim();
            if (!href) continue;

            try {
              const resolved = new URL(href, document.baseURI).href;
              links.push({
                href: resolved,
                text: (el.textContent || "").trim().slice(0, 100),
              });
            } catch {
              // Skip invalid URLs
            }
          }

          return links;
        });
      } catch (error) {
        if (options.debug) {
          console.log(`[playwright] getLinks failed: ${error}`);
        }
        return [];
      }
    },

    async getElementMeta(selector: string): Promise<ElementMeta | null> {
      const normalizedSelector = normalizeSelector(selector);
      const p = await ensurePage();
      const handle = await p.$(normalizedSelector);
      if (!handle) {
        return null;
      }
      try {
        return await handle.evaluate((el) => {
          const element = el as HTMLElement;
          const tagName = element.tagName.toLowerCase();
          const anchor = element as HTMLAnchorElement;
          const role = element.getAttribute("role") || undefined;
          const ariaExpanded = element.getAttribute("aria-expanded") || undefined;
          const ariaPressed = element.getAttribute("aria-pressed") || undefined;
          const ariaChecked = element.getAttribute("aria-checked") || undefined;
          const dataState = element.getAttribute("data-state") || undefined;
          const className =
            typeof element.className === "string" ? element.className : String(element.className || "");
          const id = element.id || undefined;
          const text = (element.textContent || "").trim().slice(0, 80) || undefined;
          const href = anchor && anchor.href ? anchor.href : undefined;
          const target = anchor && anchor.target ? anchor.target : undefined;

          return {
            tagName,
            href,
            target,
            role,
            ariaExpanded,
            ariaPressed,
            ariaChecked,
            dataState,
            className,
            id,
            text,
          };
        }) as ElementMeta;
      } finally {
        await handle.dispose();
      }
    },

    async setViewportSize(width: number, height: number): Promise<void> {
      const p = await ensurePage();
      await p.setViewportSize({ width, height });

      if (options.debug) {
        console.log(`[playwright] Viewport set to: ${width}x${height}`);
      }
    },

    async hover(selector: string): Promise<void> {
      const normalizedSelector = normalizeSelector(selector);
      await withRetry(async () => {
        const p = await ensurePage();
        await p.hover(normalizedSelector, { timeout: actionTimeout });
      }, options, 1);

      if (options.debug) {
        console.log(`[playwright] Hovered: ${selector}`);
      }
    },

    async checkActionability(selector: string): Promise<ActionabilityResult> {
      const normalizedSelector = normalizeSelector(selector);
      const p = await ensurePage();
      const script = buildActionabilityScript(normalizedSelector);
      const resultJson = await p.evaluate(script);
      return JSON.parse(resultJson as string) as ActionabilityResult;
    },

    async waitForStability(opts?: { maxWaitMs?: number; windowMs?: number }): Promise<StabilityResult> {
      const maxWaitMs = opts?.maxWaitMs ?? options.maxStabilityWaitMs ?? 5000;
      const windowMs = opts?.windowMs ?? options.stabilityWindowMs ?? 300;
      const checkInterval = options.stabilityCheckIntervalMs ?? 100;

      const p = await ensurePage();
      const startTime = Date.now();
      let lastHash = "";
      let stableFor = 0;

      while (Date.now() - startTime < maxWaitMs) {
        try {
          const currentHash = await p.evaluate(STABILITY_HASH_SCRIPT) as string;

          if (currentHash === lastHash) {
            stableFor += checkInterval;
            if (stableFor >= windowMs) {
              return {
                isStable: true,
                waitedMs: Date.now() - startTime,
                reason: "stable",
              };
            }
          } else {
            stableFor = 0;
            lastHash = currentHash;
          }

          await sleep(checkInterval);
        } catch {
          // If evaluation fails, the page might be navigating
          stableFor = 0;
          await sleep(checkInterval);
        }
      }

      return {
        isStable: false,
        waitedMs: Date.now() - startTime,
        reason: "timeout",
      };
    },

    detectActionOutcome(beforeSnapshot: PageSnapshot, afterSnapshot: PageSnapshot): ActionOutcome {
      // Check for URL change
      if (beforeSnapshot.url !== afterSnapshot.url) {
        return {
          type: "url_changed",
          details: `Navigated from ${beforeSnapshot.url} to ${afterSnapshot.url}`,
          success: true,
        };
      }

      // Check for dialog opened
      if (afterSnapshot.dialogCount > beforeSnapshot.dialogCount) {
        return {
          type: "dialog_opened",
          details: `Dialog count increased from ${beforeSnapshot.dialogCount} to ${afterSnapshot.dialogCount}`,
          success: true,
        };
      }

      // Check for scroll position change
      const scrollDelta =
        Math.abs(afterSnapshot.scrollY - beforeSnapshot.scrollY) +
        Math.abs(afterSnapshot.scrollX - beforeSnapshot.scrollX);
      if (scrollDelta > 4) {
        return {
          type: "dom_changed",
          details: `Scroll position changed (Δ${Math.round(scrollDelta)}px)`,
          success: true,
        };
      }

      // Check for theme/class changes
      if (
        beforeSnapshot.bodyClass !== afterSnapshot.bodyClass ||
        beforeSnapshot.htmlClass !== afterSnapshot.htmlClass ||
        beforeSnapshot.bodyDataTheme !== afterSnapshot.bodyDataTheme ||
        beforeSnapshot.htmlDataTheme !== afterSnapshot.htmlDataTheme
      ) {
        return {
          type: "dom_changed",
          details: "Theme/class attributes changed",
          success: true,
        };
      }

      // Check for significant DOM change
      if (beforeSnapshot.domHash !== afterSnapshot.domHash) {
        const elementDiff = Math.abs(afterSnapshot.elementCount - beforeSnapshot.elementCount);
        const textDiff = Math.abs(afterSnapshot.textLength - beforeSnapshot.textLength);

        if (elementDiff > 5 || textDiff > 100) {
          return {
            type: "dom_changed",
            details: `DOM changed: ${elementDiff} elements, ${textDiff} text chars`,
            success: true,
          };
        }
      }

      // No significant change detected
      return {
        type: "no_change",
        details: "No observable changes after action",
        success: false,
      };
    },

    async getCurrentUrl(): Promise<string> {
      const p = await ensurePage();
      return p.url();
    },

    async takePageSnapshot(): Promise<PageSnapshot> {
      const p = await ensurePage();
      const resultJson = await p.evaluate(PAGE_SNAPSHOT_SCRIPT);
      return JSON.parse(resultJson as string) as PageSnapshot;
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
