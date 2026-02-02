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
import { buildActionSelectionMessages, buildSmartInteractionMessages, buildCompactActionSelectionMessages } from "./prompts.js";
import { createHeuristicAnalyzer, type HeuristicAnalyzer } from "./heuristic-analyzer.js";

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

  // Create heuristic analyzer
  const heuristicAnalyzer: HeuristicAnalyzer = createHeuristicAnalyzer({
    confidenceThreshold: fullConfig.heuristicConfidenceThreshold,
  });

  // Statistics tracking
  let stats = {
    heuristicDecisions: 0,
    aiEscalations: 0,
    failures: 0,
    totalDecisions: 0,
  };

  async function callLLM<T>(
    systemPrompt: string,
    userPrompt: string,
    retries: number = fullConfig.maxRetries,
    timeoutMs: number = fullConfig.timeoutMs
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
        const response = await callOpenRouter(apiKey, request, timeoutMs);

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

      stats.totalDecisions++;

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

      // Build visited URLs set for heuristic analysis
      const visitedUrls = new Set<string>();
      // We could track this from coverage, but for now just use current URL
      visitedUrls.add(node.url);

      // ========================================================================
      // TIER 1: Try Heuristic First (if enabled)
      // ========================================================================
      if (fullConfig.enableHeuristicFirst) {
        const heuristicResult = heuristicAnalyzer.analyze(
          node,
          pendingEdges,
          exploredEdges,
          visitedUrls
        );

        // Check if heuristic decision is confident enough
        if (heuristicAnalyzer.shouldAccept(heuristicResult)) {
          stats.heuristicDecisions++;

          console.log(`[Heuristic] ${heuristicResult.reason} (confidence: ${heuristicResult.confidence}%)`);

          // Handle backtrack decision
          if (heuristicResult.decision === "backtrack") {
            return {
              topAction: null,
              allDecisions: [],
              branchExhausted: true,
              exhaustedReason: heuristicResult.reason,
            };
          }

          // Handle select_action decision
          if (heuristicResult.decision === "select_action" && heuristicResult.selectedEdge) {
            const selectedEdge = pendingEdges.find(e => e.id === heuristicResult.selectedEdge);

            if (selectedEdge) {
              return {
                topAction: selectedEdge,
                allDecisions: [{
                  actionId: selectedEdge.id,
                  priority: 10,
                  rationale: `Heuristic: ${heuristicResult.reason}`,
                }],
                branchExhausted: false,
              };
            }
          }
        }

        // If heuristic is uncertain, log and escalate to AI
        if (heuristicResult.decision === "uncertain") {
          console.log(`[Escalating to AI] ${heuristicResult.reason} (confidence: ${heuristicResult.confidence}%)`);
        }
      }

      // ========================================================================
      // TIER 2: Escalate to AI
      // ========================================================================
      stats.aiEscalations++;

      try {
        let response: LLMDecisionResponse;

        // Use compact prompt if heuristic first is enabled
        if (fullConfig.enableHeuristicFirst) {
          // Get top candidates for AI to consider
          const topCandidates = heuristicAnalyzer.getTopCandidatesForAI(
            pendingEdges,
            visitedUrls,
            node.url,
            5
          );

          const heuristicResult = heuristicAnalyzer.analyze(
            node,
            pendingEdges,
            exploredEdges,
            visitedUrls
          );

          const { system, user } = buildCompactActionSelectionMessages(
            node,
            topCandidates,
            heuristicResult,
            coverage
          );

          response = await callLLM<LLMDecisionResponse>(
            system,
            user,
            fullConfig.maxAIRetries,
            fullConfig.maxAITimeout
          );
        } else {
          // Use full prompt if heuristic is disabled
          const { system, user } = buildActionSelectionMessages(
            node,
            pendingEdges,
            exploredEdges,
            coverage,
            recentHistory
          );

          response = await callLLM<LLMDecisionResponse>(system, user);
        }

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
        // ========================================================================
        // TIER 3: True Failure
        // ========================================================================
        stats.failures++;
        console.warn(`[Failure] Both heuristic and AI failed:`, error);

        // Return null to indicate true failure
        return {
          topAction: null,
          allDecisions: [],
          branchExhausted: true,
          exhaustedReason: `Decision failed: ${error instanceof Error ? error.message : String(error)}`,
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

    getStats(): typeof stats {
      return { ...stats };
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
