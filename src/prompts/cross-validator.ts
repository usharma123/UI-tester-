/**
 * LLM prompts for cross-validating test results against requirements
 */

import type { Requirement, RubricCriterion } from "../validation/types.js";
import type { ScenarioRunSummary } from "../validation/cross-validator.js";

const MAX_SCENARIOS_IN_PROMPT = 20;
const MAX_STEPS_PER_SCENARIO_IN_PROMPT = 6;
const MAX_TOTAL_STEPS_IN_PROMPT = 120;
const MAX_ERRORS_IN_PROMPT = 30;
const MAX_SCREENSHOTS_IN_PROMPT = 80;

export const CROSS_VALIDATOR_SYSTEM_PROMPT = `You are an expert QA analyst reviewing test results against requirements. Your task is to determine if each requirement passed, partially passed, or failed based on the test evidence.

## Your Goal
Evaluate test results and screenshots against each requirement's rubric criteria to produce a validation verdict.

## Output Format
You MUST output ONLY valid JSON matching this schema:
{
  "results": [
    {
      "requirementId": "REQ-001",
      "status": "pass" | "partial" | "fail" | "not_tested",
      "score": 85,
      "evidence": ["screenshots/req-001-login.png"],
      "reasoning": "The login form was present and functional. User successfully entered credentials and was redirected to dashboard."
    }
  ]
}

## Status Definitions
- **pass**: All acceptance criteria met, rubric pass condition satisfied (score: 80-100)
- **partial**: Some criteria met, core functionality works but issues exist (score: 40-79)
- **fail**: Critical criteria not met, rubric fail condition applies (score: 0-39)
- **not_tested**: Requirement could not be tested (element not found, page not accessible)

## Scoring Guidelines
- 100: Perfect execution, all criteria clearly demonstrated
- 80-99: Passed with minor observations
- 60-79: Partial pass, some issues but core works
- 40-59: Borderline, significant issues but some success
- 20-39: Mostly failed with minor success
- 0-19: Complete failure or not testable

## Evidence Linking
- Link relevant screenshots to each requirement
- Multiple screenshots can support one requirement
- If no relevant screenshot exists, use empty array

## Reasoning Requirements
Your reasoning should:
1. Reference specific UI elements observed
2. Compare against the acceptance criteria
3. Explain why the status was assigned
4. Note any edge cases or ambiguities

## Output Rules
1. Output ONLY valid JSON - no markdown, no explanation
2. Provide a result for EVERY requirement
3. Be consistent with scoring (pass = 80+, partial = 40-79, fail = 0-39)
4. Include meaningful reasoning, not just "it worked" or "it failed"`;

export function buildCrossValidatorPrompt(
  requirements: Requirement[],
  rubricCriteria: RubricCriterion[],
  testResults: {
    pagesVisited: string[];
    stepsExecuted: Array<{
      type: string;
      selector?: string;
      result: string;
      screenshot?: string;
    }>;
    errors: string[];
    screenshots: string[];
    scenarioRuns?: ScenarioRunSummary[];
  }
): string {
  const requirementsText = requirements
    .map((r) => {
      const criterion = rubricCriteria.find((c) => c.requirementId === r.id);
      return `### ${r.id}: ${r.summary}
- Acceptance Criteria:
${r.acceptanceCriteria.map((c) => `  - ${c}`).join("\n")}
- Pass Condition: ${criterion?.passCondition || "N/A"}
- Fail Condition: ${criterion?.failCondition || "N/A"}`;
    })
    .join("\n\n");

  const stepsText = testResults.stepsExecuted
    .slice(0, MAX_TOTAL_STEPS_IN_PROMPT)
    .map(
      (s, i) =>
        `${i + 1}. ${s.type}${s.selector ? ` on "${s.selector}"` : ""} → ${s.result}${s.screenshot ? ` [screenshot: ${s.screenshot}]` : ""}`
    )
    .join("\n");

  const scenarioRunsText =
    testResults.scenarioRuns && testResults.scenarioRuns.length > 0
      ? `\n## Scenario Results\n${testResults.scenarioRuns
          .slice(0, MAX_SCENARIOS_IN_PROMPT)
          .map((sr) => {
            const reqIds = sr.requirementIds.length > 0 ? ` [Requirements: ${sr.requirementIds.join(", ")}]` : "";
            const stepsDetail = sr.steps
              .slice(0, MAX_STEPS_PER_SCENARIO_IN_PROMPT)
              .map((s, idx) => `  ${idx + 1}. ${s.action} → ${s.success ? "OK" : "FAIL"}${s.error ? ` (${s.error})` : ""}`)
              .join("\n");
            return `### ${sr.scenarioId}: ${sr.title}${reqIds}\nStatus: ${sr.status}\nSummary: ${sr.summary}\n${stepsDetail}`;
          })
          .join("\n\n")}`
      : "";

  const errorsText =
    testResults.errors.length > 0
      ? `\n## Errors Encountered\n${testResults.errors
          .slice(0, MAX_ERRORS_IN_PROMPT)
          .map((e) => `- ${e}`)
          .join("\n")}`
      : "";

  const screenshotList = Array.from(new Set(testResults.screenshots)).slice(0, MAX_SCREENSHOTS_IN_PROMPT);

  return `## Requirements to Validate
${requirementsText}

## Test Execution Summary
Pages visited: ${testResults.pagesVisited.join(", ")}
Screenshots captured: ${screenshotList.join(", ")}

## Steps Executed
${stepsText}
${scenarioRunsText}
${errorsText}

## Task
For each requirement, analyze the test results and determine:
1. Status: pass, partial, fail, or not_tested
2. Score: 0-100 based on how well criteria were met
3. Evidence: List relevant screenshot paths
4. Reasoning: Explain your evaluation

Consider:
- Did the test execution cover this requirement?
- Were the acceptance criteria demonstrably met?
- Do the screenshots provide evidence of success or failure?
- Were there errors that affected this requirement?

Remember: Output ONLY valid JSON, no other text.`;
}
