import OpenAI from "openai";
import type { Config } from "../config.js";
import type { Plan } from "./types.js";
import { safeParsePlan } from "./schemas.js";
import { PLANNER_SYSTEM_PROMPT, buildPlannerPrompt } from "../prompts/planner.js";
import { redactSnapshot, truncateSnapshot } from "../utils/redact.js";

export interface PlannerResult {
  plan: Plan;
  rawResponse: string;
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
  sitemapContext?: string
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
        return {
          plan: validated.data,
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
