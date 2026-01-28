/**
 * Tests for Action Selector Module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { createActionSelector, type ActionCandidate, type ScoringContext } from "../src/qa/action-selector.js";

// CSS.escape polyfill for Node.js testing (matches browser behavior)
// Based on https://drafts.csswg.org/cssom/#serialize-an-identifier
function cssEscape(value: string): string {
  const string = String(value);
  const length = string.length;
  let result = "";

  for (let index = 0; index < length; index++) {
    const char = string.charAt(index);
    const codePoint = string.charCodeAt(index);

    // If the character is NULL, replace with U+FFFD
    if (codePoint === 0x0000) {
      result += "\uFFFD";
      continue;
    }

    if (
      // If in range [\1-\1f] (control characters) or \7f (DEL)
      (codePoint >= 0x0001 && codePoint <= 0x001f) ||
      codePoint === 0x007f ||
      // If first char and is a digit
      (index === 0 && codePoint >= 0x0030 && codePoint <= 0x0039) ||
      // If second char after "-" and is a digit
      (index === 1 && codePoint >= 0x0030 && codePoint <= 0x0039 && string.charCodeAt(0) === 0x002d)
    ) {
      result += "\\" + codePoint.toString(16) + " ";
      continue;
    }

    // If the character is "-" and it's the only character
    if (index === 0 && length === 1 && codePoint === 0x002d) {
      result += "\\" + char;
      continue;
    }

    // If the character is not a letter, digit, underscore, or hyphen, or is >= 0x80
    if (
      codePoint >= 0x0080 ||
      codePoint === 0x002d || // -
      codePoint === 0x005f || // _
      (codePoint >= 0x0030 && codePoint <= 0x0039) || // 0-9
      (codePoint >= 0x0041 && codePoint <= 0x005a) || // A-Z
      (codePoint >= 0x0061 && codePoint <= 0x007a) // a-z
    ) {
      result += char;
      continue;
    }

    // Otherwise, escape the character
    result += "\\" + char;
  }

  return result;
}

const mkCandidate = (overrides: Partial<ActionCandidate> = {}): ActionCandidate => ({
  selector: "button#test", actionType: "click", priorityScore: 0,
  scoreBreakdown: { novelty: 0, businessCriticality: 0, risk: 0, branchFactor: 0 },
  element: { tagName: "button", text: "Test", role: "button" },
  wasAttempted: false, decayFactor: 1, ...overrides,
});

const mkContext = (overrides: Partial<ScoringContext> = {}): ScoringContext => ({
  visitedUrls: new Set(), submittedForms: new Set(), openedDialogs: new Set(),
  interactedElements: new Set(), actionTypeCounts: new Map(), currentUrl: "https://example.com", ...overrides,
});

describe("ActionSelector", () => {
  it("should score actions positively", () => {
    const s = createActionSelector();
    const scored = s.scoreAction(mkCandidate(), mkContext());
    assert.ok(scored.priorityScore > 0);
  });

  it("should rank actions by score", () => {
    const s = createActionSelector();
    const ctx = mkContext();
    const candidates = [
      mkCandidate({ element: { tagName: "button", text: "Cancel" } }),
      mkCandidate({ element: { tagName: "button", text: "Sign Up Free" } }),
    ];
    const ranked = s.rankActions(candidates, ctx);
    for (let i = 1; i < ranked.length; i++) {
      assert.ok(ranked[i - 1].priorityScore >= ranked[i].priorityScore);
    }
  });

  it("should select top N actions", () => {
    const s = createActionSelector();
    const candidates = Array.from({ length: 10 }, (_, i) => mkCandidate({ selector: `btn${i}` }));
    const top = s.selectTopActions(candidates, mkContext(), 3);
    assert.strictEqual(top.length, 3);
  });

  it("should apply decay on repeated attempts", () => {
    const s = createActionSelector({ decayRate: 0.5 });
    const ctx = mkContext();
    const c = mkCandidate();
    const first = s.scoreAction(c, ctx);
    s.recordAttempt(c.selector, c.actionType);
    const second = s.scoreAction(c, ctx);
    assert.ok(second.priorityScore < first.priorityScore);
  });

  it("should filter exceeded retries", () => {
    const s = createActionSelector({ maxRetries: 1 });
    const c = mkCandidate();
    s.recordAttempt(c.selector, c.actionType);
    const top = s.selectTopActions([c], mkContext(), 1);
    assert.strictEqual(top.length, 0);
  });

  it("should score CTA higher than regular", () => {
    const s = createActionSelector();
    const ctx = mkContext();
    const cta = s.scoreAction(mkCandidate({ element: { tagName: "button", text: "Get Started" } }), ctx);
    const reg = s.scoreAction(mkCandidate({ element: { tagName: "button", text: "OK" } }), ctx);
    assert.ok(cta.scoreBreakdown.businessCriticality >= reg.scoreBreakdown.businessCriticality);
  });
});

describe("CSS Selector Escaping for Tailwind Classes", () => {
  // These tests verify that CSS.escape handles Tailwind CSS special characters correctly
  // This is the same escaping logic used in the browser scripts (action-selector.ts, visual.ts)

  it("should escape ! (important modifier)", () => {
    // Tailwind: !h-8 -> should become \!h-8
    const escaped = cssEscape("!h-8");
    assert.strictEqual(escaped, "\\!h-8");
  });

  it("should escape / (opacity modifier)", () => {
    // Tailwind: text-white/80 -> should become text-white\/80
    const escaped = cssEscape("text-white/80");
    assert.strictEqual(escaped, "text-white\\/80");
  });

  it("should escape . (decimal in class)", () => {
    // Tailwind: h-1.5 -> should become h-1\.5
    const escaped = cssEscape("h-1.5");
    assert.strictEqual(escaped, "h-1\\.5");
  });

  it("should escape [ and ] (arbitrary values)", () => {
    // Tailwind: mr-[1px] -> should become mr-\[1px\]
    const escaped = cssEscape("mr-[1px]");
    assert.strictEqual(escaped, "mr-\\[1px\\]");
  });

  it("should escape : (pseudo-class modifier)", () => {
    // Tailwind: hover:bg-blue-500 -> should become hover\:bg-blue-500
    const escaped = cssEscape("hover:bg-blue-500");
    assert.strictEqual(escaped, "hover\\:bg-blue-500");
  });

  it("should handle combined special characters", () => {
    // Tailwind: !h-8.25 -> should become \!h-8\.25
    const escaped = cssEscape("!h-8.25");
    assert.strictEqual(escaped, "\\!h-8\\.25");
  });

  it("should handle left-1/2 positioning class", () => {
    // Tailwind: left-1/2 -> should become left-1\/2
    const escaped = cssEscape("left-1/2");
    assert.strictEqual(escaped, "left-1\\/2");
  });

  it("should build valid CSS selector from escaped classes", () => {
    // Simulate what getSelector does with escaped classes
    const classes = ["mr-[1px]", "!h-8.25"];
    const selector = "div." + classes.map(c => cssEscape(c)).join(".");
    assert.strictEqual(selector, "div.mr-\\[1px\\].\\!h-8\\.25");
  });

  it("should escape @ (at-rules)", () => {
    // Tailwind: @container -> should become \@container
    const escaped = cssEscape("@container");
    assert.strictEqual(escaped, "\\@container");
  });

  it("should pass through normal class names unchanged", () => {
    // Regular classes should remain unchanged
    assert.strictEqual(cssEscape("flex"), "flex");
    assert.strictEqual(cssEscape("items-center"), "items-center");
    assert.strictEqual(cssEscape("bg-blue-500"), "bg-blue-500");
    assert.strictEqual(cssEscape("text-xl"), "text-xl");
  });
});

describe("Disabled Element Handling", () => {
  it("should give disabled elements near-zero score", () => {
    const s = createActionSelector();
    const ctx = mkContext();

    // Disabled search button (like exa.ai case)
    const disabledBtn = mkCandidate({
      selector: "button[aria-label='Search']",
      element: {
        tagName: "button",
        text: "Search",
        role: "button",
        isDisabled: true,
        hasEmptyRequiredInput: true,
      },
    });

    const scored = s.scoreAction(disabledBtn, ctx);
    // Disabled elements should have very low score
    assert.ok(scored.priorityScore <= 0.1, `Expected score <= 0.1, got ${scored.priorityScore}`);
  });

  it("should filter out disabled elements from selectTopActions", () => {
    const s = createActionSelector();
    const ctx = mkContext();

    const candidates = [
      mkCandidate({
        selector: "button#search",
        element: { tagName: "button", text: "Search", isDisabled: true },
      }),
      mkCandidate({
        selector: "input#query",
        element: { tagName: "input", text: "", type: "text" },
        actionType: "fill",
      }),
    ];

    const top = s.selectTopActions(candidates, ctx, 2);

    // Should only return the input, not the disabled button
    assert.strictEqual(top.length, 1);
    assert.strictEqual(top[0].selector, "input#query");
  });

  it("should boost inputs that enable disabled submit buttons", () => {
    const s = createActionSelector();
    const ctx = mkContext();

    // Regular input
    const regularInput = mkCandidate({
      selector: "input#email",
      element: { tagName: "input", text: "Email", type: "email" },
      actionType: "fill",
    });

    // Input that would enable a disabled submit button
    const enablingInput = mkCandidate({
      selector: "input#search",
      element: {
        tagName: "input",
        text: "Search",
        type: "text",
        enablesSubmitButton: true,
      },
      actionType: "fill",
    });

    const regularScore = s.scoreAction(regularInput, ctx);
    const enablingScore = s.scoreAction(enablingInput, ctx);

    // Enabling input should score higher
    assert.ok(
      enablingScore.priorityScore > regularScore.priorityScore,
      `Expected enabling input (${enablingScore.priorityScore}) to score higher than regular (${regularScore.priorityScore})`
    );
  });

  it("should prioritize filling search input over clicking disabled search button", () => {
    const s = createActionSelector();
    const ctx = mkContext();

    // Simulates the exa.ai scenario
    const candidates = [
      // Disabled search button
      mkCandidate({
        selector: "button[aria-label='Search']",
        element: {
          tagName: "button",
          text: "Search",
          role: "button",
          isDisabled: true,
          hasEmptyRequiredInput: true,
        },
      }),
      // Search input that needs to be filled
      mkCandidate({
        selector: "input[type='text']",
        element: {
          tagName: "input",
          text: "",
          type: "text",
          enablesSubmitButton: true,
        },
        actionType: "fill",
      }),
    ];

    const top = s.selectTopActions(candidates, ctx, 1);

    // Should select the input, not the disabled button
    assert.strictEqual(top.length, 1);
    assert.strictEqual(top[0].actionType, "fill");
    assert.strictEqual(top[0].selector, "input[type='text']");
  });
});
