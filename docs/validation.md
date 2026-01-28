# Business Logic Validation

UI QA's validation mode validates websites against specification documents, providing requirement traceability and comprehensive test coverage reporting.

## Overview

Validation mode takes a specification document (Markdown) and a website URL, then:

1. Extracts testable requirements from the specification
2. Generates evaluation rubrics with pass/fail conditions
3. Discovers the site structure
4. Creates requirement-linked test plans
5. Executes tests with browser automation
6. Cross-validates results against requirements
7. Generates traceability reports

## Quick Start

```bash
# Validate a website against a specification
npx @usharma124/ui-qa validate --spec requirements.md --url https://app.example.com
```

## Specification File Format

Validation mode supports Markdown specification files. The LLM automatically extracts requirements from structured content.

### Basic Format

```markdown
# Product Requirements Document

## REQ-001: User Authentication
**Priority:** Must
**Category:** Functional

Users must be able to log in with email and password.

**Acceptance Criteria:**
- Login form is visible on the homepage
- Email and password fields are present and functional
- Submit button triggers authentication
- Error message shown for invalid credentials
- Successful login redirects to dashboard

## REQ-002: Responsive Design
**Priority:** Should
**Category:** UI

The application must be responsive across device sizes.

**Acceptance Criteria:**
- Layout adapts to mobile viewports (< 768px)
- Navigation menu collapses on mobile
- Forms remain usable on small screens
```

### Requirement Structure

The tool extracts:
- **ID**: Unique identifier (e.g., REQ-001, FR-123)
- **Priority**: MoSCoW method (must, should, could, wont)
- **Category**: functional, ui, accessibility, performance, security
- **Acceptance Criteria**: List of testable conditions

### Supported Formats

- **Numbered Requirements**: `REQ-001`, `FR-123`, `US-456`
- **Section Headers**: Requirements can be in sections
- **Bullet Points**: Acceptance criteria as lists
- **Priority Tags**: `**Priority:**`, `Priority:`, `[Must]`, etc.
- **Category Tags**: `**Category:**`, `Category:`, `Type:`, etc.

## Validation Phases

### 1. Parsing

Parses the specification document:
- Extracts sections and structure
- Identifies requirement-like content
- Preserves source location (file, line, section)

**Output**: Structured document with sections and metadata

### 2. Extraction

Uses LLM to extract testable requirements:
- Identifies requirement IDs and summaries
- Categorizes requirements (functional, UI, accessibility, performance, security)
- Assigns MoSCoW priorities
- Extracts acceptance criteria
- Filters testable vs. non-testable requirements

**Output**: List of structured requirements

### 3. Rubric Generation

Creates evaluation rubric for each requirement:
- Defines pass/fail conditions based on acceptance criteria
- Assigns weights to criteria (1-10)
- Calculates maximum possible score

**Output**: Rubric with criteria linked to requirements

### 4. Discovery

Discovers the site structure:
- Parses sitemap.xml
- Checks robots.txt for sitemap references
- Crawls links recursively
- Maps requirements to discovered pages

**Output**: List of URLs to test

### 5. Planning

Creates requirement-linked test plan:
- Links requirements to specific pages
- Generates test steps to validate each requirement
- Prioritizes based on requirement priority
- Sequences actions logically

**Output**: Test plan with requirement mappings

### 6. Execution

Runs tests with browser automation:
- Executes test plan across discovered pages
- Captures screenshots as evidence
- Records all interactions and outcomes
- Handles errors gracefully

**Output**: Test execution summary with screenshots

### 7. Cross-Validation

Validates test results against requirements:
- Compares execution evidence to rubric criteria
- Assigns status: pass/partial/fail/not_tested
- Scores each requirement (0-100)
- Links evidence screenshots to requirements
- Provides reasoning for each verdict

**Output**: Requirement validation results

### 8. Reporting

Generates traceability report:
- Links requirements to test results
- Calculates overall score (weighted average)
- Calculates coverage score (percentage tested)
- Produces markdown summary
- Includes requirement-to-evidence mapping

**Output**: Traceability report (JSON and Markdown)

## Output Format

### Traceability Report Structure

```json
{
  "specFile": "./requirements.md",
  "url": "https://app.example.com",
  "requirements": [
    {
      "id": "REQ-001",
      "summary": "User login functionality",
      "category": "functional",
      "priority": "must",
      "acceptanceCriteria": [
        "Login form is visible",
        "Email and password fields present"
      ],
      "sourceLocation": {
        "file": "./requirements.md",
        "line": 5,
        "section": "User Authentication"
      }
    }
  ],
  "rubric": {
    "criteria": [
      {
        "requirementId": "REQ-001",
        "criterion": "Login form is present",
        "weight": 10,
        "passCondition": "Login form visible on homepage",
        "failCondition": "Login form not found or hidden"
      }
    ],
    "maxScore": 100
  },
  "results": [
    {
      "requirementId": "REQ-001",
      "status": "pass",
      "score": 95,
      "evidence": ["screenshots/req-001-login.png"],
      "reasoning": "Login form was found on homepage. Email and password fields were present and functional. User successfully entered credentials and was redirected to dashboard."
    }
  ],
  "overallScore": 87,
  "coverageScore": 92,
  "summary": "Validation completed with 87% overall score. 92% of requirements were successfully tested.",
  "timestamp": 1234567890
}
```

### Requirement Status

- **pass**: Score 80-100, all criteria met
- **partial**: Score 40-79, some criteria met
- **fail**: Score 0-39, critical criteria not met
- **not_tested**: Requirement could not be tested (element not found, page not accessible)

### Scoring

- **Overall Score**: Weighted average of all requirement scores based on rubric weights
- **Coverage Score**: Percentage of requirements that were successfully tested
- **Requirement Score**: 0-100 based on rubric criteria evaluation

## Best Practices

### Writing Specifications

1. **Use Clear IDs**: Use consistent ID format (REQ-001, FR-123)
2. **Be Specific**: Write detailed acceptance criteria
3. **Prioritize**: Use MoSCoW method consistently
4. **Categorize**: Group related requirements
5. **Testable**: Focus on testable requirements (avoid vague statements)

### Example Good Requirement

```markdown
## REQ-003: Shopping Cart
**Priority:** Must
**Category:** Functional

Users must be able to add items to a shopping cart.

**Acceptance Criteria:**
- "Add to Cart" button visible on product pages
- Clicking button adds item to cart
- Cart icon shows item count badge
- Cart page displays added items
- Items persist after page refresh
```

### Example Poor Requirement

```markdown
## REQ-004: User Experience
**Priority:** Should

The app should be user-friendly.

**Acceptance Criteria:**
- It works well
```

## Configuration

Validation mode uses the same environment variables as test mode. See [Configuration](/configuration) for details.

Additional validation-specific settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_PAGES` | `50` | Maximum pages to discover and test |
| `STEPS_PER_PAGE` | `5` | Maximum steps per page |
| `PARALLEL_BROWSERS` | `5` | Concurrent browser instances |

## Troubleshooting

### Requirements Not Extracted

- Ensure requirements have clear IDs
- Include acceptance criteria
- Use structured format (headers, lists)

### Low Coverage Score

- Check if pages are accessible
- Verify requirement IDs match discovered pages
- Review test execution logs for errors

### Requirements Marked "not_tested"

- Element selectors may be incorrect
- Pages may require authentication
- Elements may be dynamically loaded

## Integration with CI/CD

```yaml
# GitHub Actions example
- name: Validate Requirements
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
  run: |
    npx @usharma124/ui-qa validate \
      --spec ./requirements.md \
      --url https://staging.app.com \
      --output ./reports
```

## Next Steps

- [Learn about test mode](/usage)
- [Configure environment variables](/configuration)
- [View example specifications](https://github.com/usharma123/UI-tester-/examples)
