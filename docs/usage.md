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
| `--goals`, `-g <string>` | Testing objectives (overrides environment variable) |
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

You will be prompted for the URL, and `https://` is added automatically if missing. Use `--goals` or the `GOALS` environment variable to customize test objectives.

### Keyboard Controls

| Key | Action |
|-----|--------|
| `Enter` | Submit / Continue |
| `↑` / `↓` | Scroll logs (while running) |
| `r` | Retry on error |
| `q` | Quit |

## Execution Phases

### Test Mode Phases

#### Discovery

Locates pages through:
- `sitemap.xml` parsing
- `robots.txt` sitemap references
- Recursive link crawling (fallback)

#### Analysis

The LLM analyzes each page to generate test scenarios:
- Considers DOM structure and a screenshot
- Incorporates specified goals
- Caps scenarios per page

#### Execution

Runs each scenario using Playwright:
- Executes step-by-step actions (click, fill, navigate, etc.)
- Captures screenshots for each step
- Runs scenarios concurrently with multiple browsers
- Retries transient failures

#### Evaluation

The LLM reviews evidence and produces:
- Quality score (0-100)
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
    ├── report.md
    ├── llm-fix.txt
    └── screenshots/
```

`run.json` contains run metadata plus the embedded report and execution evidence.

### Validation Mode Output

Results are written to the specified output directory (default: `./reports`):

```
reports/
├── traceability-report-2026-02-04T12-34-56.json
└── traceability-report-2026-02-04T12-34-56.md
```

### File Reference

**Test Mode:**

| File | Contents |
|------|----------|
| `run.json` | Run metadata plus embedded report and evidence |
| `report.md` | Human-readable summary |
| `llm-fix.txt` | Instructions for automated fixes |
| `screenshots/` | Visual evidence |

**Validation Mode:**

| File | Contents |
|------|----------|
| `traceability-report-<timestamp>.json` | Complete validation report with requirements, rubric, results, and scores |
| `traceability-report-<timestamp>.md` | Human-readable summary with requirement traceability |

### Test Mode Report Schema

```json
{
  "url": "https://example.com",
  "testedFlows": ["Checkout happy path"],
  "score": 85,
  "summary": "...",
  "issues": [
    {
      "severity": "high",
      "category": "Accessibility",
      "title": "Missing form labels",
      "reproSteps": ["Open the checkout form"],
      "expected": "Every input has a visible label",
      "actual": "Email input has no label",
      "suggestedFix": "Add a label tied to the input",
      "evidence": ["/path/to/screenshot.png"]
    }
  ],
  "artifacts": {
    "screenshots": ["/path/to/step-000.png"],
    "evidenceFile": "/path/to/.ui-qa-runs/cli-123/screenshots",
    "reportFile": "/path/to/.ui-qa-runs/cli-123/report.md",
    "llmFixFile": "/path/to/.ui-qa-runs/cli-123/llm-fix.txt"
  }
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
      "evidence": ["/path/to/screenshot.png"],
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
| `Navigation` | Navigation flows and routing issues |
| `Forms` | Form usability and validation |
| `Accessibility` | ARIA, keyboard navigation, screen readers |
| `Visual` | Layout and visual consistency |
| `Feedback` | Errors, toasts, and user feedback gaps |
| `Content` | Copy, labels, and content clarity |

### Severity Levels

| Level | Description |
|-------|-------------|
| `blocker` | Site or critical flow is unusable |
| `high` | Significant impact or broken path |
| `medium` | Notable issue with workaround |
| `low` | Minor issue |
| `nit` | Cosmetic or polish improvement |

## More Details

- [Advanced features](/advanced-features)
- [Configuration](/configuration)
