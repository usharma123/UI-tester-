/**
 * Prompt Templates for LLM-Guided Navigation
 *
 * Contains prompt templates for action selection and smart interactions.
 */

import type { GraphEdge, GraphNode } from "../graph/types.js";
import type { CoverageContext, ExplorationHistoryEntry, SmartInteractionRequest } from "./types.js";

// ============================================================================
// Action Selection Prompts
// ============================================================================

/**
 * Format edges for display in prompt
 */
function formatEdgesForPrompt(edges: GraphEdge[], maxEdges: number = 15): string {
  const limited = edges.slice(0, maxEdges);
  const lines = limited.map((edge, i) => {
    const action = edge.action;
    const label = action.element.text || action.element.ariaLabel || action.element.placeholder || action.selector;
    const truncatedLabel = label.slice(0, 60);
    const href = action.element.href ? ` -> ${new URL(action.element.href, "http://example.com").pathname}` : "";
    const type = action.element.type ? ` (${action.element.type})` : "";

    return `  ${i + 1}. [${edge.id}] ${action.type.toUpperCase()} ${action.element.tagName}${type}: "${truncatedLabel}"${href}`;
  });

  if (edges.length > maxEdges) {
    lines.push(`  ... and ${edges.length - maxEdges} more actions`);
  }

  return lines.join("\n");
}

/**
 * Format exploration history for prompt
 */
function formatHistoryForPrompt(history: ExplorationHistoryEntry[]): string {
  if (history.length === 0) {
    return "  (No recent history)";
  }

  return history
    .slice(-5)
    .map((entry, i) => {
      const status = entry.newState ? "NEW" : "same";
      return `  ${i + 1}. ${entry.action} on ${entry.url} [${status}]`;
    })
    .join("\n");
}

/**
 * Build the action selection prompt
 */
export function buildActionSelectionPrompt(
  node: GraphNode,
  pendingEdges: GraphEdge[],
  exploredEdges: GraphEdge[],
  coverage: CoverageContext,
  recentHistory: ExplorationHistoryEntry[]
): string {
  return `You are exploring a website to discover all pages and test all interactive elements.

CURRENT PAGE:
  URL: ${node.url}
  Title: ${node.title}
  Has Search Box: ${node.metadata.hasSearchBox}
  Has Forms: ${node.metadata.hasForms}
  Interactive Elements: ${node.metadata.interactiveElementCount}

PAGE ELEMENTS SUMMARY:
${node.domSummary}

AVAILABLE UNEXPLORED ACTIONS (${pendingEdges.length}):
${formatEdgesForPrompt(pendingEdges)}

ALREADY EXPLORED FROM THIS PAGE (${exploredEdges.length}):
${exploredEdges.length > 0 ? formatEdgesForPrompt(exploredEdges, 5) : "  (None yet)"}

RECENT EXPLORATION HISTORY:
${formatHistoryForPrompt(recentHistory)}

COVERAGE STATS:
  URLs visited: ${coverage.urlCount}
  Forms interacted: ${coverage.formCount}
  Searches performed: ${coverage.searchCount}
  Total steps: ${coverage.totalSteps}
  Current depth: ${coverage.currentDepth}

TASK: Prioritize the available actions. Consider:
1. Actions leading to NEW pages (high priority) - especially navigation links
2. Search boxes and forms (high priority) - need smart input values
3. Main navigation menu items (medium priority)
4. Buttons that might open modals or trigger state changes (medium priority)
5. External links or already-visited URLs (low priority - can skip)
6. Disabled elements (skip)

For search boxes and form inputs, provide an "interactionHint" with a realistic test value.

Respond with valid JSON in this exact format:
{
  "decisions": [
    {
      "actionId": "<edge_id>",
      "priority": <1-10>,
      "rationale": "<brief reason>",
      "interactionHint": "<optional: value for search/form fields>"
    }
  ],
  "branchExhausted": <true if no valuable actions remain>,
  "exhaustedReason": "<optional: why branch is exhausted>",
  "observations": "<optional: any notable observations about the page>"
}

Order decisions by priority (highest first). Include at least the top 5 actions if available.`;
}

// ============================================================================
// Smart Interaction Prompts
// ============================================================================

/**
 * Build prompt for generating smart search interactions
 */
export function buildSearchInteractionPrompt(request: SmartInteractionRequest): string {
  return `You are testing a website's search functionality.

PAGE: ${request.url}
ELEMENT: ${request.elementType} with selector "${request.selector}"
PLACEHOLDER: ${request.placeholder || "(none)"}
ARIA-LABEL: ${request.ariaLabel || "(none)"}

PAGE CONTEXT:
${request.domSummary.slice(0, 500)}

Generate a realistic search query that would:
1. Test the search functionality
2. Be relevant to the apparent website content
3. Potentially return meaningful results

Respond with valid JSON:
{
  "value": "<search query>",
  "waitForMs": <time to wait for results, typically 1500-3000>,
  "expectation": "<what should happen after search>",
  "pressEnterAfter": <true/false>
}`;
}

/**
 * Build prompt for generating smart form interactions
 */
export function buildFormInteractionPrompt(request: SmartInteractionRequest): string {
  return `You are testing a website form.

PAGE: ${request.url}
ELEMENT: ${request.elementType} with selector "${request.selector}"
PLACEHOLDER: ${request.placeholder || "(none)"}
ARIA-LABEL: ${request.ariaLabel || "(none)"}

PAGE CONTEXT:
${request.domSummary.slice(0, 500)}

Generate an appropriate test value for this form field. Consider:
- The field placeholder and label hints
- Common field types (email, password, name, phone, etc.)
- Use realistic but fake test data

Respond with valid JSON:
{
  "value": "<appropriate test value>",
  "waitForMs": <time to wait after input, typically 300-500>,
  "expectation": "<what might happen after filling this field>",
  "pressEnterAfter": false
}`;
}

/**
 * Build prompt for filter/dropdown interactions
 */
export function buildFilterInteractionPrompt(request: SmartInteractionRequest): string {
  return `You are testing a website's filter or dropdown functionality.

PAGE: ${request.url}
ELEMENT: ${request.elementType} with selector "${request.selector}"
ARIA-LABEL: ${request.ariaLabel || "(none)"}

PAGE CONTEXT:
${request.domSummary.slice(0, 500)}

Suggest how to interact with this filter/dropdown to test it effectively.

Respond with valid JSON:
{
  "value": "<value to select or action to take>",
  "waitForMs": <time to wait for results, typically 1000-2000>,
  "expectation": "<what should happen after interaction>",
  "pressEnterAfter": false
}`;
}

// ============================================================================
// System Prompts
// ============================================================================

export const ACTION_SELECTION_SYSTEM_PROMPT = `You are an expert web testing agent that explores websites systematically to maximize coverage.
Your goal is to discover all pages, test all interactive elements, and identify potential issues.
You make strategic decisions about which actions to prioritize based on their potential to discover new functionality.
Always respond with valid JSON matching the specified format.`;

export const SMART_INTERACTION_SYSTEM_PROMPT = `You are an expert web testing agent generating realistic test data for form fields and search boxes.
Generate appropriate, realistic values that would effectively test the functionality.
Always respond with valid JSON matching the specified format.`;

// ============================================================================
// Prompt Builders
// ============================================================================

export interface ActionSelectionMessages {
  system: string;
  user: string;
}

export function buildActionSelectionMessages(
  node: GraphNode,
  pendingEdges: GraphEdge[],
  exploredEdges: GraphEdge[],
  coverage: CoverageContext,
  recentHistory: ExplorationHistoryEntry[]
): ActionSelectionMessages {
  return {
    system: ACTION_SELECTION_SYSTEM_PROMPT,
    user: buildActionSelectionPrompt(node, pendingEdges, exploredEdges, coverage, recentHistory),
  };
}

export interface SmartInteractionMessages {
  system: string;
  user: string;
}

export function buildSmartInteractionMessages(request: SmartInteractionRequest): SmartInteractionMessages {
  let userPrompt: string;

  switch (request.type) {
    case "search":
      userPrompt = buildSearchInteractionPrompt(request);
      break;
    case "form":
    case "login":
      userPrompt = buildFormInteractionPrompt(request);
      break;
    case "filter":
      userPrompt = buildFilterInteractionPrompt(request);
      break;
    default:
      userPrompt = buildFormInteractionPrompt(request);
  }

  return {
    system: SMART_INTERACTION_SYSTEM_PROMPT,
    user: userPrompt,
  };
}
