# Usage

This page covers command-line options, execution phases, and output formats.

## Command Line

```bash
ui-qa <url> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--goals <string>` | Testing objectives (overrides environment variable) |
| `--help`, `-h` | Display help |

### Examples

```bash
# Basic usage
npx @usharma124/ui-qa https://example.com

# Custom goals
npx @usharma124/ui-qa https://shop.example.com --goals "checkout flow, payment forms"

# Accessibility focus
npx @usharma124/ui-qa https://example.com --goals "keyboard navigation, screen reader support"
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

### Init

Opens a headless browser and captures an initial screenshot.

### Discovery

Locates pages through:
- `sitemap.xml` parsing
- `robots.txt` sitemap references
- Recursive link crawling

### Planning

The LLM analyzes each page and generates a test plan:
- Identifies interactive elements
- Sequences test actions
- Incorporates specified goals

### Execution

Runs tests using Playwright across multiple viewports:
- Desktop (1365×768), Tablet (820×1180), Mobile (390×844)
- Clicks, form submissions, navigation
- Screenshot capture before and after each action
- Automatic retry with exponential backoff on failures
- Console and error logging

### Evaluation

The LLM reviews all evidence and produces:
- Quality score (0–100)
- Categorized issues
- Reproduction steps
- Fix recommendations

## Output Structure

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

### File Reference

| File | Contents |
|------|----------|
| `run.json` | Run metadata and status |
| `report.json` | Structured report with scores and issues |
| `evidence.json` | Detailed execution data |
| `report.md` | Human-readable summary |
| `llm-fix.txt` | Instructions for automated fixes |
| `screenshots/` | Visual evidence |

### Report Schema

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

| Range | Assessment |
|-------|------------|
| 90–100 | Excellent |
| 70–89 | Good |
| 50–69 | Fair |
| Below 50 | Needs attention |
