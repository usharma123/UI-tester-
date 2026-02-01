/**
 * Smart Interactions Module
 *
 * Handles intelligent form filling and search interactions
 * using LLM-generated values when available.
 */

import type { AgentBrowser } from "../../agentBrowser.js";
import type { DecisionEngine, SmartInteractionRequest, SmartInteractionResponse, SmartInteractionType } from "./types.js";
import type { GraphEdge, ElementInfo } from "../graph/types.js";

// ============================================================================
// Detection Patterns
// ============================================================================

/**
 * Patterns for detecting search boxes
 */
const SEARCH_PATTERNS = {
  selectors: [
    'input[type="search"]',
    '[role="searchbox"]',
    'input[name*="search" i]',
    'input[placeholder*="search" i]',
    'input[aria-label*="search" i]',
    'input[class*="search" i]',
    'input[id*="search" i]',
  ],
  placeholderKeywords: ["search", "find", "query", "look for"],
  ariaLabelKeywords: ["search", "find", "query"],
};

/**
 * Patterns for detecting filter/dropdown elements
 */
const FILTER_PATTERNS = {
  selectors: [
    'select',
    '[role="combobox"]',
    '[role="listbox"]',
    '[class*="filter" i]',
    '[class*="dropdown" i]',
    '[class*="select" i]',
  ],
  placeholderKeywords: ["filter", "sort", "select", "choose"],
};

/**
 * Patterns for detecting login forms
 */
const LOGIN_PATTERNS = {
  selectors: [
    'form[action*="login" i]',
    'form[action*="signin" i]',
    'form[class*="login" i]',
    'form[id*="login" i]',
  ],
  inputPatterns: [
    { name: "email", type: "email" },
    { name: "username", type: "text" },
    { name: "password", type: "password" },
  ],
};

// ============================================================================
// Interaction Type Detection
// ============================================================================

/**
 * Detect the type of smart interaction needed for an element
 */
export function detectInteractionType(edge: GraphEdge): SmartInteractionType | null {
  const { element, selector } = edge.action;
  const lowerSelector = selector.toLowerCase();
  const lowerPlaceholder = (element.placeholder || "").toLowerCase();
  const lowerAriaLabel = (element.ariaLabel || "").toLowerCase();
  const lowerText = (element.text || "").toLowerCase();
  const combined = `${lowerSelector} ${lowerPlaceholder} ${lowerAriaLabel} ${lowerText}`;

  // Check for search box
  if (
    element.type === "search" ||
    element.role === "searchbox" ||
    SEARCH_PATTERNS.placeholderKeywords.some(kw => combined.includes(kw))
  ) {
    return "search";
  }

  // Check for filter/dropdown
  if (
    element.tagName.toLowerCase() === "select" ||
    element.role === "combobox" ||
    element.role === "listbox" ||
    FILTER_PATTERNS.placeholderKeywords.some(kw => combined.includes(kw))
  ) {
    return "filter";
  }

  // Check for login form elements
  if (
    combined.includes("login") ||
    combined.includes("signin") ||
    combined.includes("sign in") ||
    (element.type === "password")
  ) {
    return "login";
  }

  // Default to form for fill actions
  if (edge.action.type === "fill") {
    return "form";
  }

  return null;
}

/**
 * Check if an element needs smart interaction
 */
export function needsSmartInteraction(edge: GraphEdge): boolean {
  return edge.action.type === "fill" && detectInteractionType(edge) !== null;
}

// ============================================================================
// Smart Interaction Execution
// ============================================================================

export interface SmartInteractionResult {
  success: boolean;
  value: string;
  error?: string;
  stateChanged: boolean;
}

/**
 * Execute a smart interaction using LLM-generated or default values
 */
export async function executeSmartInteraction(
  browser: AgentBrowser,
  edge: GraphEdge,
  domSummary: string,
  currentUrl: string,
  decisionEngine: DecisionEngine | null
): Promise<SmartInteractionResult> {
  const interactionType = detectInteractionType(edge);

  if (!interactionType) {
    return {
      success: false,
      value: "",
      error: "Could not determine interaction type",
      stateChanged: false,
    };
  }

  // Build request for smart interaction
  const request: SmartInteractionRequest = {
    type: interactionType,
    url: currentUrl,
    selector: edge.action.selector,
    placeholder: edge.action.element.placeholder,
    ariaLabel: edge.action.element.ariaLabel,
    domSummary,
    elementType: edge.action.element.type || edge.action.element.tagName,
  };

  // Get smart interaction response
  let response: SmartInteractionResponse;

  if (decisionEngine) {
    try {
      response = await decisionEngine.generateSmartInteraction(request);
    } catch (error) {
      console.warn("Smart interaction generation failed:", error);
      response = getDefaultInteractionResponse(request);
    }
  } else {
    response = getDefaultInteractionResponse(request);
  }

  // Use edge's interaction hint if provided (from action selection)
  if (edge.interactionHint) {
    response.value = edge.interactionHint;
  }

  // Execute the interaction
  try {
    // Take snapshot before
    const snapshotBefore = await browser.takePageSnapshot();

    // Fill the element
    await browser.fill(edge.action.selector, response.value);

    // Press Enter if needed (common for search)
    if (response.pressEnterAfter) {
      await browser.press("Enter");
    }

    // Wait for results
    await new Promise(resolve => setTimeout(resolve, response.waitForMs));

    // Wait for stability
    await browser.waitForStability({ windowMs: 300 });

    // Take snapshot after
    const snapshotAfter = await browser.takePageSnapshot();

    // Detect state change
    const stateChanged = snapshotBefore.domHash !== snapshotAfter.domHash ||
                        snapshotBefore.url !== snapshotAfter.url;

    return {
      success: true,
      value: response.value,
      stateChanged,
    };
  } catch (error) {
    return {
      success: false,
      value: response.value,
      error: error instanceof Error ? error.message : String(error),
      stateChanged: false,
    };
  }
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Get default interaction response based on element type
 */
function getDefaultInteractionResponse(request: SmartInteractionRequest): SmartInteractionResponse {
  const placeholder = (request.placeholder || "").toLowerCase();
  const ariaLabel = (request.ariaLabel || "").toLowerCase();
  const combined = `${placeholder} ${ariaLabel}`;

  switch (request.type) {
    case "search":
      return {
        value: generateSearchQuery(request),
        waitForMs: 1500,
        expectation: "Search results should appear",
        pressEnterAfter: true,
      };

    case "login":
      return {
        value: generateLoginValue(combined),
        waitForMs: 500,
        expectation: "Form should accept input",
        pressEnterAfter: false,
      };

    case "filter":
      return {
        value: "",
        waitForMs: 1000,
        expectation: "Filter should be applied",
        pressEnterAfter: false,
      };

    case "form":
    default:
      return {
        value: generateFormValue(combined, request.elementType),
        waitForMs: 300,
        expectation: "Form should accept input",
        pressEnterAfter: false,
      };
  }
}

/**
 * Generate a search query based on context
 */
function generateSearchQuery(request: SmartInteractionRequest): string {
  // Try to extract domain-specific search terms from DOM summary
  const domSummary = request.domSummary.toLowerCase();

  // Look for common content types
  if (domSummary.includes("product") || domSummary.includes("shop")) {
    return "shoes";
  }
  if (domSummary.includes("document") || domSummary.includes("docs")) {
    return "getting started";
  }
  if (domSummary.includes("article") || domSummary.includes("blog")) {
    return "latest news";
  }
  if (domSummary.includes("user") || domSummary.includes("people")) {
    return "john";
  }
  if (domSummary.includes("video") || domSummary.includes("movie")) {
    return "popular";
  }

  // Generic search query
  return "test search query";
}

/**
 * Generate login form values
 */
function generateLoginValue(fieldHint: string): string {
  if (fieldHint.includes("email")) {
    return "test@example.com";
  }
  if (fieldHint.includes("password")) {
    return "TestPassword123!";
  }
  if (fieldHint.includes("username") || fieldHint.includes("user")) {
    return "testuser";
  }
  return "test@example.com";
}

/**
 * Generate form field values based on hints
 */
function generateFormValue(fieldHint: string, elementType: string): string {
  // Email
  if (fieldHint.includes("email") || elementType === "email") {
    return "test@example.com";
  }

  // Password
  if (fieldHint.includes("password") || elementType === "password") {
    return "TestPassword123!";
  }

  // Phone
  if (fieldHint.includes("phone") || fieldHint.includes("tel") || elementType === "tel") {
    return "555-123-4567";
  }

  // Name fields
  if (fieldHint.includes("first name")) {
    return "John";
  }
  if (fieldHint.includes("last name")) {
    return "Doe";
  }
  if (fieldHint.includes("name")) {
    return "John Doe";
  }

  // Address
  if (fieldHint.includes("address") || fieldHint.includes("street")) {
    return "123 Test Street";
  }
  if (fieldHint.includes("city")) {
    return "Test City";
  }
  if (fieldHint.includes("zip") || fieldHint.includes("postal")) {
    return "12345";
  }
  if (fieldHint.includes("country")) {
    return "United States";
  }
  if (fieldHint.includes("state")) {
    return "California";
  }

  // URL
  if (fieldHint.includes("url") || fieldHint.includes("website") || elementType === "url") {
    return "https://example.com";
  }

  // Number
  if (fieldHint.includes("number") || fieldHint.includes("quantity") || elementType === "number") {
    return "42";
  }

  // Date
  if (fieldHint.includes("date") || elementType === "date") {
    return "2024-01-15";
  }

  // Default
  return "Test Value";
}

// ============================================================================
// Browser Scripts for Detection
// ============================================================================

/**
 * Script to detect search boxes on the page
 */
export const DETECT_SEARCH_BOXES_SCRIPT = `
(function() {
  const searchSelectors = ${JSON.stringify(SEARCH_PATTERNS.selectors)};
  const searchBoxes = [];

  for (const selector of searchSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            searchBoxes.push({
              selector: el.id ? '#' + el.id : (el.name ? 'input[name="' + el.name + '"]' : selector),
              placeholder: el.placeholder || '',
              ariaLabel: el.getAttribute('aria-label') || '',
            });
          }
        }
      }
    } catch (e) {}
  }

  return JSON.stringify(searchBoxes);
})()
`;

/**
 * Script to detect forms on the page
 */
export const DETECT_FORMS_SCRIPT = `
(function() {
  const forms = [];

  document.querySelectorAll('form').forEach((form, i) => {
    const style = window.getComputedStyle(form);
    if (style.display === 'none' || style.visibility === 'hidden') return;

    const inputs = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
    const formInfo = {
      id: form.id || 'form-' + i,
      action: form.action || '',
      method: form.method || 'get',
      inputs: Array.from(inputs).map(input => ({
        type: input.type || 'text',
        name: input.name || '',
        placeholder: input.placeholder || '',
        required: input.required,
      })),
    };

    if (formInfo.inputs.length > 0) {
      forms.push(formInfo);
    }
  });

  return JSON.stringify(forms);
})()
`;
