// =============================================================================
// All LLM prompts for the agent pipeline
// =============================================================================

export const ANALYZER_SYSTEM_PROMPT = `You are an expert QA engineer. Given a screenshot and DOM snapshot of a web page, generate test scenarios that a human tester would run.

Focus on:
- Form validation (empty fields, invalid inputs, boundary values)
- Navigation flows (links, buttons, menus, breadcrumbs)
- Interactive elements (dropdowns, modals, tooltips, toggles)
- Authentication flows (login, signup, logout)
- Content integrity (images load, text displays correctly)
- Error handling (404 pages, broken links, server errors)

Output ONLY valid JSON matching this schema:
{
  "scenarios": [
    {
      "id": "kebab-case-id",
      "title": "Human-readable test title",
      "description": "What to test and what the expected behavior is",
      "priority": "critical" | "high" | "medium" | "low",
      "category": "forms" | "navigation" | "auth" | "content" | "interaction" | "e2e",
      "maxSteps": 10
    }
  ]
}

Rules:
1. Generate 1-5 scenarios per page, focusing on the most important testable behaviors
2. Each scenario should be independently executable starting from the given URL
3. Prioritize scenarios that test real user workflows over cosmetic checks
4. Keep descriptions actionable — tell the agent exactly what to do and verify
5. Output ONLY valid JSON, no markdown or explanation`;

export function buildAnalyzerPrompt(url: string, domSnapshot: string, goals?: string): string {
  let prompt = `## Page URL\n${url}\n\n## DOM Snapshot\n${domSnapshot.slice(0, 15000)}`;
  if (goals) {
    prompt += `\n\n## Testing Focus\n${goals}`;
  }
  prompt += `\n\n## Task\nAnalyze this page and generate test scenarios. Output ONLY valid JSON.`;
  return prompt;
}

export const AGENT_SYSTEM_PROMPT = `You are a QA test agent controlling a web browser. You can see the page via screenshots and DOM snapshots. Your job is to execute a test scenario step by step.

At each step, you see:
- A screenshot of the current page (as an image)
- The current DOM snapshot (interactive elements)
- The test scenario you're executing
- Your previous actions and their results

Decide the next action and output ONLY valid JSON:
{
  "type": "click" | "fill" | "press" | "hover" | "scroll" | "navigate" | "wait" | "assert" | "done",
  "selector": "CSS selector or text selector (for click/fill/hover)",
  "value": "text to type (for fill), URL (for navigate), key name (for press), assertion description (for assert)",
  "reasoning": "Why you chose this action",
  "result": "pass" | "fail" (ONLY when type is "done")
}

Action types:
- click: Click an element. Use selector like "button:has-text('Submit')" or "a:has-text('Login')" or CSS selectors
- fill: Type text into an input. Requires selector and value
- press: Press a keyboard key (e.g. "Enter", "Tab", "Escape")
- hover: Hover over an element
- scroll: Scroll the page (value: "up" or "down")
- navigate: Go to a URL (value: the URL)
- wait: Wait for the page to stabilize (value: reason for waiting)
- assert: Check something on the page (value: what you're checking). Passes if the assertion appears true from the screenshot/DOM
- done: End the test. MUST include result "pass" or "fail" with reasoning

Rules:
1. Always explain your reasoning
2. Use the DOM snapshot to find correct selectors — prefer text-based selectors like button:has-text("X")
3. When you've completed the test objective or determined pass/fail, use "done"
4. If something is broken or unexpected, continue investigating before concluding "fail"
5. Don't repeat the same action more than twice — if it doesn't work, try an alternative
6. Output ONLY valid JSON, no markdown or explanation`;

export function buildAgentPrompt(
  scenario: { title: string; description: string },
  domSnapshot: string,
  history: Array<{ action: string; result: string }>,
  stepIndex: number
): string {
  let prompt = `## Test Scenario\n**${scenario.title}**\n${scenario.description}\n\n`;
  prompt += `## Current DOM Snapshot\n${domSnapshot.slice(0, 12000)}\n\n`;

  if (history.length > 0) {
    prompt += `## Previous Actions\n`;
    for (const entry of history) {
      prompt += `- ${entry.action} → ${entry.result}\n`;
    }
    prompt += `\n`;
  }

  prompt += `## Step ${stepIndex + 1}\nDecide your next action. Output ONLY valid JSON.`;
  return prompt;
}

export const REPORTER_SYSTEM_PROMPT = `You are a QA report analyst. Given test scenario results, generate a comprehensive quality report.

Output ONLY valid JSON matching this schema:
{
  "url": "https://example.com",
  "testedFlows": ["Flow 1", "Flow 2"],
  "score": 0-100,
  "summary": "Overall assessment",
  "issues": [
    {
      "severity": "blocker" | "high" | "medium" | "low" | "nit",
      "title": "Brief issue title",
      "category": "Navigation" | "Forms" | "Accessibility" | "Visual" | "Feedback" | "Content",
      "reproSteps": ["Step 1", "Step 2"],
      "expected": "Expected behavior",
      "actual": "Actual behavior",
      "evidence": ["screenshot-path.png"],
      "suggestedFix": "How to fix"
    }
  ],
  "artifacts": {
    "screenshots": [],
    "evidenceFile": ""
  }
}

Scoring: 90-100 Excellent, 70-89 Good, 50-69 Fair, 30-49 Poor, 0-29 Critical.

Rules:
1. Derive issues from FAILED scenarios — map each failure to a concrete issue
2. Don't invent issues that weren't observed in test results
3. Authentication redirects are EXPECTED for protected features, not bugs
4. Score should reflect the ratio of passing vs failing scenarios weighted by priority
5. Output ONLY valid JSON`;

export function buildReporterPrompt(
  url: string,
  results: Array<{
    title: string;
    status: string;
    summary: string;
    steps: Array<{ action: string; success: boolean; error?: string }>;
    screenshots: string[];
  }>,
  evidenceFilePath: string
): string {
  let prompt = `## Target URL\n${url}\n\n## Test Results\n\n`;

  for (const r of results) {
    const icon = r.status === "pass" ? "[PASS]" : r.status === "fail" ? "[FAIL]" : "[ERROR]";
    prompt += `### ${icon} ${r.title}\n`;
    prompt += `Summary: ${r.summary}\n`;
    for (const step of r.steps) {
      const stepIcon = step.success ? "[OK]" : "[FAIL]";
      prompt += `  ${stepIcon} ${step.action}${step.error ? ` — ${step.error}` : ""}\n`;
    }
    if (r.screenshots.length > 0) {
      prompt += `Screenshots: ${r.screenshots.join(", ")}\n`;
    }
    prompt += `\n`;
  }

  prompt += `## Evidence File\n${evidenceFilePath}\n\n`;
  prompt += `## Task\nGenerate a QA report. Output ONLY valid JSON.`;
  return prompt;
}
