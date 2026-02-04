// =============================================================================
// Page analyzer: sends screenshot + DOM to LLM, gets test scenarios
// =============================================================================

import { readFile } from "node:fs/promises";
import type { AgentBrowser } from "../agentBrowser.js";
import type { TestScenario } from "./types.js";
import type { LLMClient, LLMMessage } from "./llm.js";
import { screenshotToContent, extractJson } from "./llm.js";
import { ANALYZER_SYSTEM_PROMPT, buildAnalyzerPrompt } from "./prompts.js";

export interface AnalyzePageOptions {
  browser: AgentBrowser;
  url: string;
  llm: LLMClient;
  screenshotDir: string;
  maxScenarios: number;
  goals?: string;
}

export async function analyzePage(options: AnalyzePageOptions): Promise<TestScenario[]> {
  const { browser, url, llm, screenshotDir, maxScenarios, goals } = options;

  // Navigate and capture state
  await browser.open(url);
  await browser.waitForStability();

  const screenshotPath = `${screenshotDir}/analyze-${encodeURIComponent(url).slice(0, 50)}.png`;
  await browser.screenshot(screenshotPath);

  const domSnapshot = await browser.snapshot();

  // Read screenshot for vision
  let screenshotBase64: string;
  try {
    const buffer = await readFile(screenshotPath);
    screenshotBase64 = buffer.toString("base64");
  } catch {
    screenshotBase64 = "";
  }

  const userPrompt = buildAnalyzerPrompt(url, domSnapshot, goals);
  const messages: LLMMessage[] = [
    { role: "system", content: ANALYZER_SYSTEM_PROMPT },
    {
      role: "user",
      content: screenshotBase64
        ? [
            screenshotToContent(screenshotBase64),
            { type: "text" as const, text: userPrompt },
          ]
        : userPrompt,
    },
  ];

  const raw = await llm.chat(messages, { temperature: 0.3, maxTokens: 4096 });
  const json = extractJson(raw);

  let parsed: { scenarios: Array<Omit<TestScenario, "startUrl">> };
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (!parsed.scenarios || !Array.isArray(parsed.scenarios)) {
    return [];
  }

  // Attach the URL and limit count
  return parsed.scenarios.slice(0, maxScenarios).map((s) => ({
    id: s.id || `scenario-${Math.random().toString(36).slice(2, 8)}`,
    title: s.title || "Untitled scenario",
    description: s.description || "",
    startUrl: url,
    priority: s.priority || "medium",
    category: s.category || "interaction",
    maxSteps: Math.min(s.maxSteps || 6, 8), // Cap at 8 steps max for efficiency
    scope: s.scope || inferScope(s.id || "", s.title || "", s.category || "interaction"),
  }));
}

/** Infer scope based on scenario characteristics */
function inferScope(
  id: string, 
  title: string, 
  category: string
): "global" | "page" {
  const globalPatterns = [
    /theme/i, /toggle/i, /dark\s*mode/i, /light\s*mode/i,
    /navigation/i, /nav\s*menu/i, /header/i, /footer/i,
    /login/i, /logout/i, /auth/i, /sign\s*in/i, /sign\s*out/i,
  ];
  
  const text = `${id} ${title}`;
  for (const pattern of globalPatterns) {
    if (pattern.test(text)) {
      return "global";
    }
  }
  
  // Navigation category is typically global
  if (category === "navigation" && /menu|header|footer/i.test(text)) {
    return "global";
  }
  
  return "page";
}
