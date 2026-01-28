/**
 * LLM prompts for rubric generation from requirements
 */

import type { Requirement } from "../validation/types.js";

export const RUBRIC_SYSTEM_PROMPT = `You are an expert QA engineer creating a test rubric. Your task is to convert requirements into specific, testable criteria with clear pass/fail conditions.

## Your Goal
For each requirement, create rubric criteria that can be evaluated through UI testing.

## Output Format
You MUST output ONLY valid JSON matching this schema:
{
  "criteria": [
    {
      "requirementId": "REQ-001",
      "criterion": "Login form accepts valid email and password",
      "weight": 8,
      "passCondition": "User can enter email, password, click submit, and see a success state or dashboard",
      "failCondition": "Login form not present, submission causes error, or authentication fails with valid test credentials"
    }
  ],
  "maxScore": 100
}

## Weight Guidelines (1-10 scale)
- **10**: Critical path functionality (checkout, login for auth-required sites)
- **8-9**: Core features that most users will need
- **6-7**: Important but secondary features
- **4-5**: Nice-to-have features
- **1-3**: Minor enhancements or edge cases

## Pass Condition Rules
Pass conditions should be:
1. Observable through the UI (visible elements, state changes, navigation)
2. Specific and unambiguous ("see a confirmation message" not "works correctly")
3. Testable with browser automation
4. Include what the tester should see/verify

## Fail Condition Rules
Fail conditions should describe:
1. Element not found or not visible
2. Unexpected error states
3. Incorrect behavior or missing functionality
4. Broken interactions

## Non-Testable Requirements
For requirements marked as testable: false, create criteria with:
- weight: 1
- passCondition: "Unable to test via UI automation"
- failCondition: "N/A - requires manual verification"

## Output Rules
1. Output ONLY valid JSON - no markdown, no explanation
2. Create exactly one criterion per requirement
3. Sum of weights should be meaningful (typically 50-150)
4. maxScore should equal the sum of all weights`;

export function buildRubricPrompt(requirements: Requirement[]): string {
  const requirementsText = requirements
    .map(
      (r) =>
        `### ${r.id}: ${r.summary}
- Category: ${r.category}
- Priority: ${r.priority}
- Testable: ${r.testable}
- Acceptance Criteria:
${r.acceptanceCriteria.map((c) => `  - ${c}`).join("\n")}`
    )
    .join("\n\n");

  return `## Requirements to Convert to Rubric
${requirementsText}

## Task
Create a testing rubric with specific pass/fail conditions for each requirement.

For each requirement:
1. Create a criterion that captures the core testable aspect
2. Assign an appropriate weight (1-10) based on priority and importance
3. Define a clear pass condition (what success looks like)
4. Define a clear fail condition (what failure looks like)

Priority to weight mapping:
- must → weight 8-10
- should → weight 5-7
- could → weight 3-4
- wont → weight 1-2

Remember: Output ONLY valid JSON, no other text.`;
}
