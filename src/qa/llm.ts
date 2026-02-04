// =============================================================================
// Thin OpenRouter wrapper with vision support
// =============================================================================

import OpenAI from "openai";
import type { Config } from "../config.js";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | LLMContentPart[];
}

export type LLMContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface LLMClient {
  chat(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<string>;
}

export function createLLMClient(config: Config): LLMClient {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: config.openRouterApiKey,
  });

  return {
    async chat(messages, options = {}) {
      const { temperature = 0.2, maxTokens = 4096 } = options;

      const response = await client.chat.completions.create({
        model: config.openRouterModel,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        temperature,
        max_tokens: maxTokens,
      });

      return response.choices[0]?.message?.content ?? "";
    },
  };
}

export function screenshotToContent(base64: string): LLMContentPart {
  return {
    type: "image_url",
    image_url: { url: `data:image/png;base64,${base64}` },
  };
}

export function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
