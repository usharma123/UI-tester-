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

/** Captured page data (browser-dependent, fast ~1s) */
export interface PageCapture {
  url: string;
  screenshotBase64: string;
  domSnapshot: string;
  goals?: string;
}

/** Capture page state: navigate, screenshot, DOM snapshot */
export async function capturePage(options: {
  browser: AgentBrowser;
  url: string;
  screenshotDir: string;
  goals?: string;
}): Promise<PageCapture> {
  const { browser, url, screenshotDir, goals } = options;

  await browser.open(url);
  await browser.waitForStability();

  const screenshotPath = `${screenshotDir}/analyze-${encodeURIComponent(url).slice(0, 50)}.png`;
  await browser.screenshot(screenshotPath);

  const domSnapshot = await browser.snapshot();

  let screenshotBase64: string;
  try {
    const buffer = await readFile(screenshotPath);
    screenshotBase64 = buffer.toString("base64");
  } catch {
    screenshotBase64 = "";
  }

  return { url, screenshotBase64, domSnapshot, goals };
}

/** Analyze captured page data via LLM (no browser needed, slow ~5-10s) */
export async function analyzeCapture(options: {
  capture: PageCapture;
  llm: LLMClient;
  maxScenarios: number;
}): Promise<TestScenario[]> {
  const { capture, llm, maxScenarios } = options;
  const { url, screenshotBase64, domSnapshot, goals } = capture;

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

  return parsed.scenarios.slice(0, maxScenarios).map((s) => ({
    id: s.id || `scenario-${Math.random().toString(36).slice(2, 8)}`,
    title: s.title || "Untitled scenario",
    description: s.description || "",
    startUrl: url,
    priority: s.priority || "medium",
    category: s.category || "interaction",
    maxSteps: Math.min(s.maxSteps || 6, 8),
    scope: s.scope || inferScope(s.id || "", s.title || "", s.category || "interaction"),
    requirementIds: Array.isArray((s as { requirementIds?: unknown }).requirementIds)
      ? ((s as { requirementIds?: unknown[] }).requirementIds
          ?.filter((id): id is string => typeof id === "string")
          .slice(0, 10) ?? [])
      : undefined,
  }));
}

/** Full analyze: capture + LLM analysis (convenience wrapper) */
export async function analyzePage(options: AnalyzePageOptions): Promise<TestScenario[]> {
  const { browser, url, llm, screenshotDir, maxScenarios, goals } = options;

  const capture = await capturePage({ browser, url, screenshotDir, goals });
  return analyzeCapture({ capture, llm, maxScenarios });
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
