import OpenAI from "openai";
import type { Config } from "../config.js";
import type { Plan, PagePlan, Step } from "./types.js";
import { safeParsePlan, safeParsePagePlan } from "./schemas.js";
import { PLANNER_SYSTEM_PROMPT, buildPlannerPrompt, PAGE_TEST_SYSTEM_PROMPT, buildPageTestPrompt } from "../prompts/planner.js";
import { redactSnapshot, truncateSnapshot } from "../utils/redact.js";

export interface PlannerResult {
  plan: Plan;
  rawResponse: string;
}

/**
 * Validate and filter URLs in plan steps against the sitemap
 * This prevents the LLM from fabricating URLs that don't exist
 */
function validatePlanUrls(plan: Plan, baseUrl: string, sitemapUrls: string[]): Plan {
  const baseHost = new URL(baseUrl).hostname;
  const validUrls = new Set([baseUrl, ...sitemapUrls]);

  // Also add normalized versions (with/without trailing slash)
  for (const url of sitemapUrls) {
    validUrls.add(url.replace(/\/$/, ""));
    validUrls.add(url.replace(/\/$/, "") + "/");
  }
  validUrls.add(baseUrl.replace(/\/$/, ""));
  validUrls.add(baseUrl.replace(/\/$/, "") + "/");

  const validatedSteps: Step[] = [];

  for (const step of plan.steps) {
    if (step.type === "open" && step.selector) {
      try {
        const stepUrl = new URL(step.selector);

        // Must be same domain
        if (stepUrl.hostname !== baseHost) {
          console.warn(`[Planner] Skipping cross-domain URL: ${step.selector}`);
          continue;
        }

        // Check if URL is in sitemap or is the base URL
        const normalizedStepUrl = step.selector.replace(/\/$/, "");
        if (!validUrls.has(step.selector) && !validUrls.has(normalizedStepUrl)) {
          // URL was fabricated by LLM - skip it
          console.warn(`[Planner] Skipping fabricated URL (not in sitemap): ${step.selector}`);
          continue;
        }

        validatedSteps.push(step);
      } catch {
        // Invalid URL - skip
        console.warn(`[Planner] Skipping invalid URL: ${step.selector}`);
        continue;
      }
    } else {
      // Non-open steps pass through
      validatedSteps.push(step);
    }
  }

  return {
    ...plan,
    steps: validatedSteps,
  };
}

function extractJson(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return text;
}

export async function createPlan(
  config: Config,
  url: string,
  goals: string,
  snapshot: string,
  sitemapContext?: string,
  sitemapUrls?: string[]
): Promise<PlannerResult> {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: config.openRouterApiKey,
  });

  const processedSnapshot = truncateSnapshot(redactSnapshot(snapshot), 40000);
  const userPrompt = buildPlannerPrompt(url, goals, processedSnapshot, sitemapContext);

  let lastError: Error | null = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: PLANNER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    if (attempt > 0 && lastError) {
      messages.push({
        role: "user",
        content: `Your previous response was invalid JSON. Error: ${lastError.message}\n\nPlease output ONLY valid JSON matching the schema. No markdown, no explanation.`,
      });
    }

    const response = await client.chat.completions.create({
      model: config.openRouterModel,
      messages,
      temperature: 0.3,
      max_tokens: 4000,
    });

    const rawResponse = response.choices[0]?.message?.content ?? "";

    try {
      const jsonStr = extractJson(rawResponse);
      const parsed = JSON.parse(jsonStr);
      const validated = safeParsePlan(parsed);

      if (validated.success) {
        // Validate URLs in the plan against the sitemap to prevent fabricated URLs
        const validatedPlan = sitemapUrls && sitemapUrls.length > 0
          ? validatePlanUrls(validated.data, url, sitemapUrls)
          : validated.data;

        return {
          plan: validatedPlan,
          rawResponse,
        };
      }

      lastError = new Error(
        `Schema validation failed: ${validated.error.errors.map((e) => e.message).join(", ")}`
      );
    } catch (parseError) {
      lastError = parseError instanceof Error ? parseError : new Error(String(parseError));
    }
  }

  throw new Error(`Failed to generate valid plan after ${maxRetries} attempts: ${lastError?.message}`);
}

export interface PagePlannerResult {
  plan: PagePlan;
  rawResponse: string;
}

/**
 * Create a focused test plan for a single page
 * Used in systematic page-by-page testing
 */
export async function createPagePlan(
  config: Config,
  pageUrl: string,
  snapshot: string,
  stepsPerPage: number = 5
): Promise<PagePlannerResult> {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: config.openRouterApiKey,
  });

  const processedSnapshot = truncateSnapshot(redactSnapshot(snapshot), 20000);
  const userPrompt = buildPageTestPrompt(pageUrl, processedSnapshot, stepsPerPage);

  let lastError: Error | null = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: PAGE_TEST_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    if (attempt > 0 && lastError) {
      messages.push({
        role: "user",
        content: `Your previous response was invalid JSON. Error: ${lastError.message}\n\nPlease output ONLY valid JSON matching the schema. No markdown, no explanation.`,
      });
    }

    const response = await client.chat.completions.create({
      model: config.openRouterModel,
      messages,
      temperature: 0.3,
      max_tokens: 2000, // Smaller response for per-page plans
    });

    const rawResponse = response.choices[0]?.message?.content ?? "";

    try {
      const jsonStr = extractJson(rawResponse);
      const parsed = JSON.parse(jsonStr);
      const validated = safeParsePagePlan(parsed);

      if (validated.success) {
        // Filter out any "open" steps that might have slipped through
        const filteredSteps = validated.data.steps.filter((step) => step.type !== "open");

        return {
          plan: { steps: filteredSteps.slice(0, stepsPerPage) },
          rawResponse,
        };
      }

      lastError = new Error(
        `Schema validation failed: ${validated.error.errors.map((e) => e.message).join(", ")}`
      );
    } catch (parseError) {
      lastError = parseError instanceof Error ? parseError : new Error(String(parseError));
    }
  }

  // If we couldn't generate a valid plan, return an empty plan
  // (don't block the entire test run for one page)
  return {
    plan: { steps: [] },
    rawResponse: `Failed to generate valid page plan: ${lastError?.message}`,
  };
}
