/**
 * LLM Decision Engine
 *
 * Core logic for LLM-driven navigation decisions.
 */

import type { GraphEdge } from "../graph/types.js";
import type {
  DecisionEngine,
  LLMDecisionContext,
  LLMDecisionResponse,
  LLMDecisionResult,
  LLMNavigatorConfig,
  OpenRouterMessage,
  OpenRouterRequest,
  OpenRouterResponse,
  SmartInteractionRequest,
  SmartInteractionResponse,
  ActionDecision,
} from "./types.js";
import { DEFAULT_LLM_NAVIGATOR_CONFIG } from "./types.js";
import { buildActionSelectionMessages, buildSmartInteractionMessages } from "./prompts.js";

// ============================================================================
// API Client
// ============================================================================

/**
 * Call OpenRouter API
 */
async function callOpenRouter(
  apiKey: string,
  request: OpenRouterRequest,
  timeoutMs: number
): Promise<OpenRouterResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/anthropics/ui-tester",
        "X-Title": "UI Tester LLM Navigator",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    return await response.json() as OpenRouterResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse JSON from LLM response, handling markdown code blocks
 */
function parseJsonResponse<T>(content: string): T {
  // Remove markdown code blocks if present
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  return JSON.parse(jsonStr) as T;
}

// ============================================================================
// Decision Engine Implementation
// ============================================================================

/**
 * Create an LLM decision engine
 */
export function createDecisionEngine(
  apiKey: string,
  config: Partial<LLMNavigatorConfig> = {}
): DecisionEngine {
  const fullConfig: LLMNavigatorConfig = {
    ...DEFAULT_LLM_NAVIGATOR_CONFIG,
    ...config,
  };

  async function callLLM<T>(
    systemPrompt: string,
    userPrompt: string,
    retries: number = fullConfig.maxRetries
  ): Promise<T> {
    const messages: OpenRouterMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const request: OpenRouterRequest = {
      model: fullConfig.model,
      messages,
      temperature: fullConfig.temperature,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await callOpenRouter(apiKey, request, fullConfig.timeoutMs);

        if (!response.choices || response.choices.length === 0) {
          throw new Error("No response from LLM");
        }

        const content = response.choices[0].message.content;
        return parseJsonResponse<T>(content);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("LLM call failed");
  }

  return {
    async selectAction(context: LLMDecisionContext): Promise<LLMDecisionResult> {
      const { node, pendingEdges, coverage, recentHistory } = context;

      // If no pending edges, branch is exhausted
      if (pendingEdges.length === 0) {
        return {
          topAction: null,
          allDecisions: [],
          branchExhausted: true,
          exhaustedReason: "No pending actions available",
        };
      }

      // Get already explored edges
      const exploredEdges = node.actions.filter(e => e.status === "explored" || e.status === "failed");

      try {
        const { system, user } = buildActionSelectionMessages(
          node,
          pendingEdges,
          exploredEdges,
          coverage,
          recentHistory
        );

        const response = await callLLM<LLMDecisionResponse>(system, user);

        // Validate and process decisions
        const validDecisions: ActionDecision[] = [];
        for (const decision of response.decisions || []) {
          // Find the corresponding edge
          const edge = pendingEdges.find(e => e.id === decision.actionId);
          if (edge) {
            validDecisions.push({
              ...decision,
              priority: Math.max(1, Math.min(10, decision.priority)), // Clamp to 1-10
            });
          }
        }

        // Sort by priority (highest first)
        validDecisions.sort((a, b) => b.priority - a.priority);

        // Find the top action
        let topAction: GraphEdge | null = null;
        let interactionHint: string | undefined;

        if (validDecisions.length > 0) {
          const topDecision = validDecisions[0];
          topAction = pendingEdges.find(e => e.id === topDecision.actionId) || null;
          interactionHint = topDecision.interactionHint;
        }

        return {
          topAction,
          allDecisions: validDecisions,
          branchExhausted: response.branchExhausted || validDecisions.length === 0,
          exhaustedReason: response.exhaustedReason,
          interactionHint,
        };
      } catch (error) {
        console.warn("LLM decision failed, falling back to heuristic:", error);

        // Fallback: return first pending edge sorted by basic heuristics
        const sortedEdges = [...pendingEdges].sort((a, b) => {
          // Prioritize navigation links
          const aIsNav = a.action.element.href ? 1 : 0;
          const bIsNav = b.action.element.href ? 1 : 0;
          if (aIsNav !== bIsNav) return bIsNav - aIsNav;

          // Prioritize forms/inputs
          const aIsForm = a.action.type === "fill" ? 1 : 0;
          const bIsForm = b.action.type === "fill" ? 1 : 0;
          if (aIsForm !== bIsForm) return bIsForm - aIsForm;

          return 0;
        });

        return {
          topAction: sortedEdges[0] || null,
          allDecisions: sortedEdges.map((edge, i) => ({
            actionId: edge.id,
            priority: 10 - i,
            rationale: "Heuristic fallback",
          })),
          branchExhausted: sortedEdges.length === 0,
          exhaustedReason: sortedEdges.length === 0 ? "No actions available" : undefined,
        };
      }
    },

    async generateSmartInteraction(request: SmartInteractionRequest): Promise<SmartInteractionResponse> {
      if (!fullConfig.smartInteractions) {
        // Return default values if smart interactions disabled
        return getDefaultSmartInteraction(request);
      }

      try {
        const { system, user } = buildSmartInteractionMessages(request);
        const response = await callLLM<SmartInteractionResponse>(system, user);

        return {
          value: response.value || getDefaultValue(request),
          waitForMs: response.waitForMs || 1500,
          expectation: response.expectation || "Page should update",
          pressEnterAfter: response.pressEnterAfter ?? (request.type === "search"),
        };
      } catch (error) {
        console.warn("Smart interaction generation failed, using defaults:", error);
        return getDefaultSmartInteraction(request);
      }
    },

    getConfig(): LLMNavigatorConfig {
      return { ...fullConfig };
    },
  };
}

// ============================================================================
// Default Value Generation
// ============================================================================

/**
 * Get default smart interaction response
 */
function getDefaultSmartInteraction(request: SmartInteractionRequest): SmartInteractionResponse {
  return {
    value: getDefaultValue(request),
    waitForMs: request.type === "search" ? 1500 : 500,
    expectation: request.type === "search" ? "Search results should appear" : "Form should accept input",
    pressEnterAfter: request.type === "search",
  };
}

/**
 * Get default value based on element characteristics
 */
function getDefaultValue(request: SmartInteractionRequest): string {
  const placeholder = (request.placeholder || "").toLowerCase();
  const ariaLabel = (request.ariaLabel || "").toLowerCase();
  const selector = (request.selector || "").toLowerCase();
  const combined = `${placeholder} ${ariaLabel} ${selector}`;

  // Search
  if (request.type === "search" || combined.includes("search")) {
    return "test query";
  }

  // Email
  if (combined.includes("email")) {
    return "test@example.com";
  }

  // Password
  if (combined.includes("password")) {
    return "TestPassword123!";
  }

  // Phone
  if (combined.includes("phone") || combined.includes("tel")) {
    return "555-123-4567";
  }

  // Name
  if (combined.includes("name")) {
    if (combined.includes("first")) return "John";
    if (combined.includes("last")) return "Doe";
    return "John Doe";
  }

  // URL
  if (combined.includes("url") || combined.includes("website")) {
    return "https://example.com";
  }

  // Number
  if (request.elementType === "number" || combined.includes("number") || combined.includes("quantity")) {
    return "42";
  }

  // Default
  return "test value";
}
