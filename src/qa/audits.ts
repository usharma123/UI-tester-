import type { AgentBrowser } from "../agentBrowser.js";
import type { DomAuditResult, DomAuditSamples, DomAuditSummary, ViewportInfo } from "./types.js";

const GENERIC_LINK_TEXTS = [
  "learn more",
  "click here",
  "read more",
  "here",
  "more",
  "details",
  "view",
  "see more",
  "explore",
];

const AUDIT_SCRIPT = `
(function () {
  const maxSamples = 5;
  const genericLinkTexts = ${JSON.stringify(GENERIC_LINK_TEXTS)};
  const doc = document;
  const win = window;

  const toText = (el) => (el && el.textContent ? el.textContent : "")
    .replace(/\\s+/g, " ")
    .trim()
    .slice(0, 120);

  const getLabelledByText = (el) => {
    const ids = (el.getAttribute("aria-labelledby") || "").split(/\\s+/).filter(Boolean);
    if (!ids.length) return "";
    return ids.map((id) => toText(doc.getElementById(id))).join(" ").trim();
  };

  const shortSelector = (el) => {
    if (!el || !el.tagName) return "";
    const parts = [];
    let current = el;
    for (let i = 0; current && i < 3; i += 1) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += "#" + current.id;
        parts.unshift(part);
        break;
      }
      const className = (current.className || "").toString().trim();
      if (className) {
        const classes = className.split(/\\s+/).filter(Boolean).slice(0, 2);
        if (classes.length) part += "." + classes.join(".");
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(" > ");
  };

  const isVisible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const style = win.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const sample = (items, mapFn) => items.slice(0, maxSamples).map(mapFn);

  const images = Array.from(doc.querySelectorAll("img"));
  const imagesMissingAlt = images.filter((img) => !img.getAttribute("alt") || !img.getAttribute("alt").trim());

  const inputs = Array.from(doc.querySelectorAll("input, textarea, select"))
    .filter((el) => el.getAttribute("type") !== "hidden");
  const inputsMissingLabel = inputs.filter((el) => {
    const ariaLabel = el.getAttribute("aria-label");
    const labelledBy = getLabelledByText(el);
    const hasLabel = (el.labels && el.labels.length > 0) || ariaLabel || labelledBy;
    return !hasLabel;
  });

  const buttons = Array.from(doc.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']"));
  const buttonsMissingLabel = buttons.filter((el) => {
    const ariaLabel = el.getAttribute("aria-label");
    const labelledBy = getLabelledByText(el);
    const title = el.getAttribute("title");
    const text = toText(el);
    const value = el.value || "";
    const name = (ariaLabel || labelledBy || title || text || value || "").trim();
    return !name;
  });

  const links = Array.from(doc.querySelectorAll("a[href]"));
  const linksGenericText = links.filter((el) => {
    const text = toText(el).toLowerCase();
    return text && genericLinkTexts.includes(text);
  });

  const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  const emptyHeadings = headings.filter((el) => !toText(el));
  const h1Count = headings.filter((el) => el.tagName.toLowerCase() === "h1").length;

  let headingOrderIssues = 0;
  const headingOrderSamples = [];
  let lastLevel = 0;
  headings.forEach((el) => {
    const level = parseInt(el.tagName.substring(1), 10);
    if (lastLevel && level > lastLevel + 1) {
      headingOrderIssues += 1;
      if (headingOrderSamples.length < maxSamples) {
        headingOrderSamples.push({
          selector: shortSelector(el),
          text: "H" + lastLevel + " to H" + level + ": " + toText(el),
        });
      }
    }
    lastLevel = level;
  });

  const interactive = Array.from(doc.querySelectorAll(
    "a[href], button, input, select, textarea, [role='button']"
  )).filter((el) => isVisible(el));
  const smallTouchTargets = interactive.filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
  });

  const htmlLangMissing = !doc.documentElement.getAttribute("lang");
  const horizontalOverflowPx = Math.max(0, doc.documentElement.scrollWidth - win.innerWidth);

  const summary = {
    imagesMissingAlt: imagesMissingAlt.length,
    inputsMissingLabel: inputsMissingLabel.length,
    buttonsMissingLabel: buttonsMissingLabel.length,
    linksGenericText: linksGenericText.length,
    emptyHeadings: emptyHeadings.length,
    headingOrderIssues,
    h1Count,
    smallTouchTargets: smallTouchTargets.length,
    htmlLangMissing,
    horizontalOverflowPx,
  };

  const samples = {
    imagesMissingAlt: sample(imagesMissingAlt, (el) => ({ selector: shortSelector(el) })),
    inputsMissingLabel: sample(inputsMissingLabel, (el) => ({
      selector: shortSelector(el),
      text: (el.getAttribute("placeholder") || "").slice(0, 80),
    })),
    buttonsMissingLabel: sample(buttonsMissingLabel, (el) => ({ selector: shortSelector(el) })),
    linksGenericText: sample(linksGenericText, (el) => ({ selector: shortSelector(el), text: toText(el) })),
    emptyHeadings: sample(emptyHeadings, (el) => ({ selector: shortSelector(el) })),
    headingOrderIssues: headingOrderSamples,
    smallTouchTargets: sample(smallTouchTargets, (el) => ({
      selector: shortSelector(el),
      text: toText(el),
    })),
  };

  const viewport = {
    width: win.innerWidth || 0,
    height: win.innerHeight || 0,
    devicePixelRatio: win.devicePixelRatio || 1,
  };

  return JSON.stringify({ summary, samples, viewport });
})()
`.replace(/\\n/g, " ");

export async function runDomAudit(
  browser: AgentBrowser,
  pageUrl: string,
  label: string
): Promise<DomAuditResult> {
  const { summary, samples, viewport } = await browser.evalJson<{
    summary: DomAuditSummary;
    samples: DomAuditSamples;
    viewport: ViewportInfo;
  }>(AUDIT_SCRIPT);

  return {
    pageUrl,
    label,
    viewport,
    summary,
    samples,
    timestamp: Date.now(),
  };
}

export async function getViewportInfo(browser: AgentBrowser): Promise<ViewportInfo> {
  return browser.evalJson<ViewportInfo>(
    `JSON.stringify({width: window.innerWidth || 0, height: window.innerHeight || 0, devicePixelRatio: window.devicePixelRatio || 1})`
  );
}

export async function trySetViewport(
  browser: AgentBrowser,
  width: number,
  height: number
): Promise<{ applied: boolean; actual: ViewportInfo }> {
  try {
    await browser.setViewportSize(width, height);
    const actual = await getViewportInfo(browser);
    const applied = Math.abs(actual.width - width) <= 2 && Math.abs(actual.height - height) <= 2;
    return { applied, actual };
  } catch {
    // Fallback: return current viewport as "not applied"
    const actual = await getViewportInfo(browser);
    return { applied: false, actual };
  }
}
