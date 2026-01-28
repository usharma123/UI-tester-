# Usage

This page covers command-line options, execution phases, and output formats.

## Command Line

UI QA supports two modes:

### Test Mode (Default)

```bash
ui-qa [url] [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--goals <string>` | Testing objectives (overrides environment variable) |
| `--help`, `-h` | Display help |

### Validation Mode

```bash
ui-qa validate --spec <file> --url <url> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--spec`, `-s <file>` | Path to requirements/specification file (required) |
| `--url`, `-u <url>` | URL to validate against (required) |
| `--output`, `-o <dir>` | Output directory for reports (default: ./reports) |
| `--help`, `-h` | Display help |

### Examples

**Test Mode:**

```bash
# Basic usage
npx @usharma124/ui-qa https://example.com

# Custom goals
npx @usharma124/ui-qa https://shop.example.com --goals "checkout flow, payment forms"

# Accessibility focus
npx @usharma124/ui-qa https://example.com --goals "keyboard navigation, screen reader support"
```

**Validation Mode:**

```bash
# Validate against a specification
npx @usharma124/ui-qa validate --spec ./requirements.md --url https://app.example.com

# With custom output directory
npx @usharma124/ui-qa validate -s ./prd.md -u https://staging.app.com -o ./reports
```

## Interactive Mode

Running without a URL launches the interactive interface:

```bash
npx @usharma124/ui-qa
```

### Keyboard Controls

| Key | Action |
|-----|--------|
| `Enter` | Submit / Continue |
| `↑` / `↓` | Scroll logs |
| `r` | Retry on error |
| `q` | Quit |

## Execution Phases

### Test Mode Phases

#### Init

Opens a headless browser and captures an initial screenshot.

#### Discovery

Locates pages through:
- `sitemap.xml` parsing
- `robots.txt` sitemap references
- Recursive link crawling

#### Planning

The LLM analyzes each page and generates a test plan:
- Identifies interactive elements
- Sequences test actions
- Incorporates specified goals

#### Execution

Runs tests using Playwright across multiple viewports:
- Desktop (1365×768), Tablet (820×1180), Mobile (390×844)
- Clicks, form submissions, navigation
- Screenshot capture before and after each action
- Automatic retry with exponential backoff on failures
- Console and error logging

#### Evaluation

The LLM reviews all evidence and produces:
- Quality score (0–100)
- Categorized issues
- Reproduction steps
- Fix recommendations

### Validation Mode Phases

Validation mode runs through eight phases to validate a website against a specification document:

#### 1. Parsing

Parses the specification document (supports Markdown):
- Extracts sections and structure
- Identifies requirement-like content
- Preserves source location information

#### 2. Extraction

Uses LLM to extract testable requirements:
- Identifies functional, UI, accessibility, performance, and security requirements
- Assigns MoSCoW priorities (must, should, could, wont)
- Extracts acceptance criteria
- Filters testable vs. non-testable requirements

#### 3. Rubric Generation

Creates evaluation rubric for each requirement:
- Defines pass/fail conditions
- Assigns weights to criteria
- Calculates maximum possible score

#### 4. Discovery

Discovers the site structure:
- Same as test mode discovery
- Maps requirements to discovered pages

#### 5. Planning

Creates requirement-linked test plan:
- Links requirements to specific pages
- Generates test steps to validate each requirement
- Prioritizes based on requirement priority

#### 6. Execution

Runs tests with browser automation:
- Executes test plan across discovered pages
- Captures screenshots as evidence
- Records all interactions and outcomes

#### 7. Cross-Validation

Validates test results against requirements:
- Compares execution evidence to rubric criteria
- Assigns pass/partial/fail/not_tested status
- Scores each requirement (0-100)
- Links evidence screenshots to requirements

#### 8. Reporting

Generates traceability report:
- Links requirements to test results
- Calculates overall score and coverage
- Produces markdown summary
- Includes requirement-to-evidence mapping

## Output Structure

### Test Mode Output

Results are written to `.ui-qa-runs/<run-id>/`:

```
.ui-qa-runs/
└── cli-1234567890/
    ├── run.json
    ├── report.json
    ├── evidence.json
    ├── report.md
    ├── llm-fix.txt
    └── screenshots/
```

### Validation Mode Output

Results are written to the specified output directory (default: `./reports`):

```
reports/
└── validation-1234567890/
    ├── traceability-report.json
    ├── traceability-report.md
    └── screenshots/
        ├── req-001-login.png
        └── ...
```

### File Reference

**Test Mode:**

| File | Contents |
|------|----------|
| `run.json` | Run metadata and status |
| `report.json` | Structured report with scores and issues |
| `evidence.json` | Detailed execution data |
| `report.md` | Human-readable summary |
| `llm-fix.txt` | Instructions for automated fixes |
| `screenshots/` | Visual evidence |

**Validation Mode:**

| File | Contents |
|------|----------|
| `traceability-report.json` | Complete validation report with requirements, rubric, results, and scores |
| `traceability-report.md` | Human-readable summary with requirement traceability |
| `screenshots/` | Visual evidence linked to requirements |

### Test Mode Report Schema

```json
{
  "score": 85,
  "summary": "...",
  "issues": [
    {
      "severity": "high",
      "category": "accessibility",
      "title": "Missing form labels",
      "description": "...",
      "reproduction": ["..."],
      "suggestion": "..."
    }
  ]
}
```

### Validation Mode Report Schema

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
      "acceptanceCriteria": ["..."]
    }
  ],
  "rubric": {
    "criteria": [
      {
        "requirementId": "REQ-001",
        "criterion": "Login form is present",
        "weight": 10,
        "passCondition": "...",
        "failCondition": "..."
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
      "reasoning": "..."
    }
  ],
  "overallScore": 87,
  "coverageScore": 92,
  "summary": "...",
  "timestamp": 1234567890
}
```

### Issue Categories

| Category | Description |
|----------|-------------|
| `accessibility` | ARIA, keyboard navigation, screen readers |
| `usability` | UX problems, confusing flows |
| `functionality` | Broken features, errors |
| `performance` | Loading, animations |
| `visual` | Layout, responsive design |

### Severity Levels

| Level | Description |
|-------|-------------|
| `critical` | Site unusable |
| `high` | Significant impact |
| `medium` | Notable issues |
| `low` | Minor improvements |

## Safety

UI QA is designed for safe operation:

- Uses dummy data for forms (`test@example.com`)
- Does not submit payment forms
- Redacts sensitive data before LLM processing
- Enforces timeouts on all operations

## Debugging

Enable verbose output:

```bash
DEBUG=true npx @usharma124/ui-qa https://example.com
```

## Score Interpretation

### Test Mode Scores

| Range | Assessment |
|-------|------------|
| 90–100 | Excellent |
| 70–89 | Good |
| 50–69 | Fair |
| Below 50 | Needs attention |

### Validation Mode Scores

**Overall Score (0-100):**
- Weighted average of all requirement scores based on rubric weights

**Coverage Score (0-100):**
- Percentage of requirements that were successfully tested
- Requirements marked as `not_tested` reduce coverage

**Requirement Status:**
- `pass`: Score 80-100, all criteria met
- `partial`: Score 40-79, some criteria met
- `fail`: Score 0-39, critical criteria not met
- `not_tested`: Requirement could not be tested

## Specification File Format

Validation mode supports Markdown specification files. The LLM will extract requirements from structured content:

```markdown
# Requirements

## REQ-001: User Login
**Priority:** Must
**Category:** Functional

Users must be able to log in with email and password.

**Acceptance Criteria:**
- Login form is visible on the homepage
- Email and password fields are present
- Submit button triggers authentication
- Error message shown for invalid credentials
```

The tool automatically identifies requirement-like content and extracts structured data including IDs, priorities, categories, and acceptance criteria.
