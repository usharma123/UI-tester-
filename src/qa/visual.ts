/**
 * Visual Heuristics Module
 * 
 * Performs fast visual checks in the browser context to detect
 * common UI/UX issues without requiring external tools.
 */

import type { AgentBrowser } from "../agentBrowser.js";
import { join } from "node:path";
import { createHash } from "node:crypto";

// ============================================================================
// Types
// ============================================================================

export type VisualIssueType =
  | "overlapping_clickables"
  | "clipped_text"
  | "small_tap_target"
  | "offscreen_primary_cta"
  | "fixed_header_covering"
  | "horizontal_overflow"
  | "low_contrast"
  | "missing_focus_indicator"
  | "text_over_image_unreadable";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualIssue {
  type: VisualIssueType;
  severity: "high" | "medium" | "low";
  message: string;
  selector?: string;
  boundingBox?: BoundingBox;
  details?: Record<string, unknown>;
}

export interface VisualAuditResult {
  pageUrl: string;
  viewport: {
    width: number;
    height: number;
  };
  issues: VisualIssue[];
  timestamp: number;
  /** Duration of the audit in ms */
  durationMs: number;
}

export interface VisualAuditConfig {
  /** Minimum tap target size in pixels (default: 44) */
  minTapTargetSize: number;
  /** Maximum horizontal overflow in pixels before flagging (default: 0) */
  maxHorizontalOverflow: number;
  /** Whether to check for overlapping clickables (default: true) */
  checkOverlappingClickables: boolean;
  /** Whether to check for clipped text (default: true) */
  checkClippedText: boolean;
  /** Whether to check for fixed header issues (default: true) */
  checkFixedHeaders: boolean;
  /** Whether to check for low contrast (default: false - expensive) */
  checkContrast: boolean;
  /** Whether to check for focus indicators (default: true) */
  checkFocusIndicators: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_VISUAL_AUDIT_CONFIG: VisualAuditConfig = {
  minTapTargetSize: 44,
  maxHorizontalOverflow: 0,
  checkOverlappingClickables: true,
  checkClippedText: true,
  checkFixedHeaders: true,
  checkContrast: false,
  checkFocusIndicators: true,
};

// ============================================================================
// Browser Scripts
// ============================================================================

/**
 * Script to detect overlapping clickable elements
 */
const OVERLAPPING_CLICKABLES_SCRIPT = `
(function() {
  const clickables = Array.from(document.querySelectorAll(
    'a[href], button, input[type="submit"], input[type="button"], ' +
    '[role="button"], [role="link"], [onclick]'
  )).filter(el => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  
  const issues = [];
  
  for (let i = 0; i < clickables.length; i++) {
    const el1 = clickables[i];
    const rect1 = el1.getBoundingClientRect();
    
    for (let j = i + 1; j < clickables.length; j++) {
      const el2 = clickables[j];
      
      // Skip if one contains the other
      if (el1.contains(el2) || el2.contains(el1)) continue;
      
      const rect2 = el2.getBoundingClientRect();
      
      // Check for overlap
      const overlap = !(
        rect1.right < rect2.left ||
        rect1.left > rect2.right ||
        rect1.bottom < rect2.top ||
        rect1.top > rect2.bottom
      );
      
      if (overlap) {
        // Calculate overlap area
        const overlapX = Math.max(0, Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left));
        const overlapY = Math.max(0, Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top));
        const overlapArea = overlapX * overlapY;
        
        // Only report significant overlaps (> 100 sq pixels)
        if (overlapArea > 100) {
          issues.push({
            selector1: getSelector(el1),
            selector2: getSelector(el2),
            overlapArea,
            boundingBox: {
              x: Math.max(rect1.left, rect2.left),
              y: Math.max(rect1.top, rect2.top),
              width: overlapX,
              height: overlapY
            }
          });
        }
      }
    }
  }
  
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    let selector = el.tagName.toLowerCase();
    if (el.className) {
      const classes = el.className.toString().split(' ').filter(c => c).slice(0, 2);
      if (classes.length) selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }
    return selector;
  }

  return JSON.stringify(issues.slice(0, 10)); // Limit to 10 issues
})()
`;

/**
 * Script to detect clipped text
 */
const CLIPPED_TEXT_SCRIPT = `
(function() {
  const issues = [];
  
  // Check all text-containing elements
  const elements = document.querySelectorAll(
    'p, span, div, h1, h2, h3, h4, h5, h6, a, button, label, li'
  );
  
  for (const el of elements) {
    const style = window.getComputedStyle(el);
    
    // Check for text overflow with overflow:hidden
    if (style.overflow === 'hidden' || style.textOverflow === 'ellipsis') {
      if (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          issues.push({
            selector: getSelector(el),
            text: el.textContent.trim().slice(0, 50),
            clippedWidth: el.scrollWidth - el.clientWidth,
            clippedHeight: el.scrollHeight - el.clientHeight,
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          });
        }
      }
    }
  }
  
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    let selector = el.tagName.toLowerCase();
    if (el.className) {
      const classes = el.className.toString().split(' ').filter(c => c).slice(0, 2);
      if (classes.length) selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }
    return selector;
  }

  return JSON.stringify(issues.slice(0, 10));
})()
`;

/**
 * Script to detect small tap targets
 */
function buildSmallTapTargetsScript(minSize: number): string {
  return `
(function() {
  const minSize = ${minSize};
  const issues = [];
  
  const interactive = Array.from(document.querySelectorAll(
    'a[href], button, input, select, textarea, [role="button"], [role="link"], ' +
    '[role="checkbox"], [role="radio"], [role="tab"]'
  )).filter(el => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  
  for (const el of interactive) {
    const rect = el.getBoundingClientRect();
    
    if (rect.width < minSize || rect.height < minSize) {
      issues.push({
        selector: getSelector(el),
        text: (el.textContent || '').trim().slice(0, 50) || el.getAttribute('aria-label') || '',
        width: rect.width,
        height: rect.height,
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      });
    }
  }
  
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    let selector = el.tagName.toLowerCase();
    if (el.className) {
      const classes = el.className.toString().split(' ').filter(c => c).slice(0, 2);
      if (classes.length) selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }
    return selector;
  }

  return JSON.stringify(issues.slice(0, 10));
})()
`;
}

/**
 * Script to detect primary CTA off-screen
 */
const OFFSCREEN_CTA_SCRIPT = `
(function() {
  const ctaKeywords = [
    'sign up', 'signup', 'register', 'get started', 'try free',
    'buy now', 'purchase', 'add to cart', 'checkout',
    'subscribe', 'download', 'contact', 'book', 'demo'
  ];
  
  const buttons = Array.from(document.querySelectorAll(
    'button, a[href], [role="button"], input[type="submit"]'
  ));
  
  const issues = [];
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  
  for (const el of buttons) {
    const text = (el.textContent || '').toLowerCase().trim();
    const isPrimaryCTA = ctaKeywords.some(kw => text.includes(kw));
    
    if (!isPrimaryCTA) continue;
    
    const rect = el.getBoundingClientRect();
    
    // Check if off-screen
    if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) {
      issues.push({
        selector: getSelector(el),
        text: text.slice(0, 50),
        position: {
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right
        },
        viewportHeight: vh,
        viewportWidth: vw
      });
    }
  }
  
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    let selector = el.tagName.toLowerCase();
    if (el.className) {
      const classes = el.className.toString().split(' ').filter(c => c).slice(0, 2);
      if (classes.length) selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }
    return selector;
  }

  return JSON.stringify(issues.slice(0, 5));
})()
`;

/**
 * Script to detect fixed header covering content
 */
const FIXED_HEADER_COVERING_SCRIPT = `
(function() {
  const fixedElements = Array.from(document.querySelectorAll('*')).filter(el => {
    const style = window.getComputedStyle(el);
    return (style.position === 'fixed' || style.position === 'sticky') &&
           parseInt(style.top) === 0;
  });
  
  if (fixedElements.length === 0) {
    return JSON.stringify([]);
  }
  
  const issues = [];
  
  for (const fixed of fixedElements) {
    const fixedRect = fixed.getBoundingClientRect();
    
    // Check if it covers more than 20% of viewport
    const coveragePercent = (fixedRect.height / window.innerHeight) * 100;
    
    if (coveragePercent > 20) {
      issues.push({
        selector: getSelector(fixed),
        height: fixedRect.height,
        coveragePercent: coveragePercent.toFixed(1),
        boundingBox: {
          x: fixedRect.x,
          y: fixedRect.y,
          width: fixedRect.width,
          height: fixedRect.height
        }
      });
    }
  }
  
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    let selector = el.tagName.toLowerCase();
    if (el.className) {
      const classes = el.className.toString().split(' ').filter(c => c).slice(0, 2);
      if (classes.length) selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }
    return selector;
  }

  return JSON.stringify(issues.slice(0, 3));
})()
`;

/**
 * Script to detect horizontal overflow
 */
const HORIZONTAL_OVERFLOW_SCRIPT = `
(function() {
  const docWidth = document.documentElement.scrollWidth;
  const viewWidth = window.innerWidth;
  const overflow = docWidth - viewWidth;
  
  if (overflow <= 0) {
    return JSON.stringify({ hasOverflow: false, overflowPx: 0 });
  }
  
  // Try to find the element causing the overflow
  const culprits = [];
  const elements = document.querySelectorAll('*');
  
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (rect.right > viewWidth) {
      culprits.push({
        selector: getSelector(el),
        rightEdge: rect.right,
        overflow: rect.right - viewWidth
      });
    }
  }
  
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    let selector = el.tagName.toLowerCase();
    if (el.className) {
      const classes = el.className.toString().split(' ').filter(c => c).slice(0, 2);
      if (classes.length) selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }
    return selector;
  }

  // Sort by overflow and take top 3
  culprits.sort((a, b) => b.overflow - a.overflow);
  
  return JSON.stringify({
    hasOverflow: true,
    overflowPx: overflow,
    culprits: culprits.slice(0, 3)
  });
})()
`;

/**
 * Script to check for missing focus indicators
 */
const FOCUS_INDICATOR_SCRIPT = `
(function() {
  const issues = [];
  
  // Find focusable elements
  const focusable = Array.from(document.querySelectorAll(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )).filter(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }).slice(0, 20); // Sample first 20
  
  for (const el of focusable) {
    // Get styles before focus
    const beforeFocus = window.getComputedStyle(el);
    const beforeOutline = beforeFocus.outline;
    const beforeBoxShadow = beforeFocus.boxShadow;
    const beforeBorder = beforeFocus.border;
    const beforeBackground = beforeFocus.backgroundColor;
    
    // Focus the element
    el.focus();
    
    // Get styles after focus
    const afterFocus = window.getComputedStyle(el);
    const afterOutline = afterFocus.outline;
    const afterBoxShadow = afterFocus.boxShadow;
    const afterBorder = afterFocus.border;
    const afterBackground = afterFocus.backgroundColor;
    
    // Check if there's any visible change
    const hasOutlineChange = afterOutline !== beforeOutline && afterOutline !== 'none' && afterOutline !== '0px none';
    const hasBoxShadowChange = afterBoxShadow !== beforeBoxShadow && afterBoxShadow !== 'none';
    const hasBorderChange = afterBorder !== beforeBorder;
    const hasBackgroundChange = afterBackground !== beforeBackground;
    
    const hasVisibleIndicator = hasOutlineChange || hasBoxShadowChange || hasBorderChange || hasBackgroundChange;
    
    if (!hasVisibleIndicator) {
      const rect = el.getBoundingClientRect();
      issues.push({
        selector: getSelector(el),
        tagName: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 30),
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      });
    }
    
    // Blur the element
    el.blur();
  }
  
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    let selector = el.tagName.toLowerCase();
    if (el.className) {
      const classes = el.className.toString().split(' ').filter(c => c).slice(0, 2);
      if (classes.length) selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }
    return selector;
  }

  return JSON.stringify(issues.slice(0, 10));
})()
`;

// ============================================================================
// Visual Audit Implementation
// ============================================================================

/**
 * Run visual heuristics audit on the current page
 */
export async function runVisualAudit(
  browser: AgentBrowser,
  pageUrl: string,
  config: Partial<VisualAuditConfig> = {}
): Promise<VisualAuditResult> {
  const fullConfig: VisualAuditConfig = {
    ...DEFAULT_VISUAL_AUDIT_CONFIG,
    ...config,
  };

  const startTime = Date.now();
  const issues: VisualIssue[] = [];

  // Get viewport info
  const viewportJson = await browser.eval(
    `JSON.stringify({ width: window.innerWidth, height: window.innerHeight })`
  );
  const viewport = JSON.parse(viewportJson);

  // Check for horizontal overflow
  try {
    const overflowJson = await browser.eval(HORIZONTAL_OVERFLOW_SCRIPT);
    const overflow = JSON.parse(overflowJson);

    if (overflow.hasOverflow && overflow.overflowPx > fullConfig.maxHorizontalOverflow) {
      issues.push({
        type: "horizontal_overflow",
        severity: overflow.overflowPx > 50 ? "high" : "medium",
        message: `Page has ${overflow.overflowPx}px horizontal overflow`,
        details: {
          overflowPx: overflow.overflowPx,
          culprits: overflow.culprits,
        },
      });
    }
  } catch {
    // Ignore errors
  }

  // Check for overlapping clickables
  if (fullConfig.checkOverlappingClickables) {
    try {
      const overlapsJson = await browser.eval(OVERLAPPING_CLICKABLES_SCRIPT);
      const overlaps = JSON.parse(overlapsJson);

      for (const overlap of overlaps) {
        issues.push({
          type: "overlapping_clickables",
          severity: overlap.overlapArea > 500 ? "high" : "medium",
          message: `Clickable elements overlap: ${overlap.selector1} and ${overlap.selector2}`,
          boundingBox: overlap.boundingBox,
          details: {
            selector1: overlap.selector1,
            selector2: overlap.selector2,
            overlapArea: overlap.overlapArea,
          },
        });
      }
    } catch {
      // Ignore errors
    }
  }

  // Check for clipped text
  if (fullConfig.checkClippedText) {
    try {
      const clippedJson = await browser.eval(CLIPPED_TEXT_SCRIPT);
      const clipped = JSON.parse(clippedJson);

      for (const item of clipped) {
        if (item.clippedWidth > 10 || item.clippedHeight > 5) {
          issues.push({
            type: "clipped_text",
            severity: item.clippedWidth > 50 || item.clippedHeight > 20 ? "medium" : "low",
            message: `Text is clipped: "${item.text}"`,
            selector: item.selector,
            boundingBox: item.boundingBox,
            details: {
              clippedWidth: item.clippedWidth,
              clippedHeight: item.clippedHeight,
            },
          });
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Check for small tap targets
  try {
    const smallTargetsJson = await browser.eval(
      buildSmallTapTargetsScript(fullConfig.minTapTargetSize)
    );
    const smallTargets = JSON.parse(smallTargetsJson);

    for (const item of smallTargets) {
      issues.push({
        type: "small_tap_target",
        severity: item.width < 30 || item.height < 30 ? "high" : "medium",
        message: `Small tap target (${item.width.toFixed(0)}x${item.height.toFixed(0)}px): "${item.text || item.selector}"`,
        selector: item.selector,
        boundingBox: item.boundingBox,
        details: {
          width: item.width,
          height: item.height,
          minRequired: fullConfig.minTapTargetSize,
        },
      });
    }
  } catch {
    // Ignore errors
  }

  // Check for off-screen primary CTAs
  try {
    const offscreenJson = await browser.eval(OFFSCREEN_CTA_SCRIPT);
    const offscreen = JSON.parse(offscreenJson);

    for (const item of offscreen) {
      issues.push({
        type: "offscreen_primary_cta",
        severity: "high",
        message: `Primary CTA is off-screen: "${item.text}"`,
        selector: item.selector,
        details: {
          position: item.position,
          viewport: {
            width: item.viewportWidth,
            height: item.viewportHeight,
          },
        },
      });
    }
  } catch {
    // Ignore errors
  }

  // Check for fixed header covering content
  if (fullConfig.checkFixedHeaders) {
    try {
      const fixedJson = await browser.eval(FIXED_HEADER_COVERING_SCRIPT);
      const fixed = JSON.parse(fixedJson);

      for (const item of fixed) {
        issues.push({
          type: "fixed_header_covering",
          severity: parseFloat(item.coveragePercent) > 30 ? "high" : "medium",
          message: `Fixed header covers ${item.coveragePercent}% of viewport`,
          selector: item.selector,
          boundingBox: item.boundingBox,
          details: {
            height: item.height,
            coveragePercent: item.coveragePercent,
          },
        });
      }
    } catch {
      // Ignore errors
    }
  }

  // Check for missing focus indicators
  if (fullConfig.checkFocusIndicators) {
    try {
      const focusJson = await browser.eval(FOCUS_INDICATOR_SCRIPT);
      const focusIssues = JSON.parse(focusJson);

      for (const item of focusIssues) {
        issues.push({
          type: "missing_focus_indicator",
          severity: "medium",
          message: `Missing focus indicator on ${item.tagName}: "${item.text || item.selector}"`,
          selector: item.selector,
          boundingBox: item.boundingBox,
        });
      }
    } catch {
      // Ignore errors
    }
  }

  return {
    pageUrl,
    viewport,
    issues,
    timestamp: Date.now(),
    durationMs: Date.now() - startTime,
  };
}

// ============================================================================
// Screenshot Baseline System
// ============================================================================

export interface ScreenshotBaseline {
  /** Unique identifier for this route (URL path) */
  routeId: string;
  /** Path to the baseline image */
  baselineImagePath: string;
  /** Viewport configuration used */
  viewport: {
    width: number;
    height: number;
  };
  /** Regions to mask during comparison */
  masks: MaskRegion[];
  /** When the baseline was captured */
  capturedAt: number;
}

export interface MaskRegion {
  /** Selector for the element to mask */
  selector?: string;
  /** Or explicit bounding box */
  boundingBox?: BoundingBox;
  /** Reason for masking */
  reason: "timestamp" | "avatar" | "ad" | "dynamic" | "user-defined";
}

export interface ScreenshotComparisonResult {
  /** Whether the screenshots match within threshold */
  matches: boolean;
  /** Difference percentage (0-100) */
  diffPercent: number;
  /** Path to the diff image (if generated) */
  diffImagePath?: string;
  /** Regions that changed */
  changedRegions: BoundingBox[];
}

/**
 * Auto-detect regions that should be masked
 */
const AUTO_MASK_SCRIPT = `
(function() {
  const masks = [];
  
  // Timestamps
  const timeElements = document.querySelectorAll('time, [datetime], [class*="timestamp"], [class*="time-ago"]');
  for (const el of timeElements) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      masks.push({
        selector: getSelector(el),
        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        reason: 'timestamp'
      });
    }
  }
  
  // Avatars
  const avatars = document.querySelectorAll('[class*="avatar"], [class*="profile-image"], [class*="user-pic"]');
  for (const el of avatars) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      masks.push({
        selector: getSelector(el),
        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        reason: 'avatar'
      });
    }
  }
  
  // Ads
  const ads = document.querySelectorAll('iframe[src*="ad"], [class*="ad-"], [id*="google_ads"]');
  for (const el of ads) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      masks.push({
        selector: getSelector(el),
        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        reason: 'ad'
      });
    }
  }
  
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    let selector = el.tagName.toLowerCase();
    if (el.className) {
      const classes = el.className.toString().split(' ').filter(c => c).slice(0, 2);
      if (classes.length) selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }
    return selector;
  }

  return JSON.stringify(masks);
})()
`;

/**
 * Get auto-detected mask regions for a page
 */
export async function getAutoMaskRegions(browser: AgentBrowser): Promise<MaskRegion[]> {
  try {
    const masksJson = await browser.eval(AUTO_MASK_SCRIPT);
    return JSON.parse(masksJson);
  } catch {
    return [];
  }
}

/**
 * Create a route ID from a URL
 */
export function createRouteId(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\//g, "-").replace(/^-|-$/g, "") || "home";
    const hash = createHash("sha256").update(url).digest("hex").slice(0, 8);
    return `${path}-${hash}`;
  } catch {
    return `route-${createHash("sha256").update(url).digest("hex").slice(0, 8)}`;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format visual audit result for display
 */
export function formatVisualAuditResult(result: VisualAuditResult): string {
  const lines: string[] = [];

  lines.push(`Visual Audit: ${result.pageUrl}`);
  lines.push(`Viewport: ${result.viewport.width}x${result.viewport.height}`);
  lines.push(`Duration: ${result.durationMs}ms`);
  lines.push(`Issues found: ${result.issues.length}`);

  if (result.issues.length > 0) {
    lines.push("");
    lines.push("Issues:");

    for (const issue of result.issues) {
      const severity = issue.severity.toUpperCase();
      lines.push(`  [${severity}] ${issue.type}: ${issue.message}`);
      if (issue.selector) {
        lines.push(`    Selector: ${issue.selector}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Get issue count by severity
 */
export function countIssuesBySeverity(
  issues: VisualIssue[]
): { high: number; medium: number; low: number } {
  return {
    high: issues.filter(i => i.severity === "high").length,
    medium: issues.filter(i => i.severity === "medium").length,
    low: issues.filter(i => i.severity === "low").length,
  };
}

