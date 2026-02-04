---
layout: home

hero:
  text: Automated UI/UX Testing
  tagline: Test websites with intelligent browser automation and LLM-powered analysis
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/usharma123/UI-tester-

features:
  - title: Intelligent Scenario Generation
    details: LLM generates test scenarios per page from DOM snapshots and screenshots
  - title: Sitemap + Link Discovery
    details: Finds pages via sitemap/robots.txt with link-crawling fallback
  - title: Real Browser Automation
    details: Executes tests using Playwright with real clicks, fills, and navigation
  - title: Parallel Scenario Execution
    details: Runs scenarios concurrently across multiple browser instances
  - title: Business Logic Validation
    details: Validates websites against specifications with requirement traceability
  - title: Screenshot Evidence
    details: Captures screenshots for every step and issue
  - title: Scored Reports + LLM Fix Guide
    details: Generates a scored report and a plain-text fix guide for LLMs
  - title: Local Run History
    details: Stores runs in .ui-qa-runs with run.json, report.md, and screenshots
  - title: TUI Progress + Logs
    details: Live terminal UI with phases, progress bars, and log streaming
  - title: Update Notifications
    details: Checks for new versions and prompts when updates are available
---

## Quick Start

### UI/UX Testing
```bash
npx @usharma124/ui-qa https://example.com
```

### Business Logic Validation
```bash
npx @usharma124/ui-qa validate --spec requirements.md --url https://app.example.com
```

::: info Prerequisites
An [OpenRouter API key](https://openrouter.ai/) is required. See [Configuration](/configuration) for setup details.
:::

## How It Works

UI QA offers two modes:

### Test Mode (Default)
Processes websites through four phases:

| Phase | Description |
|-------|-------------|
| Discovery | Identifies pages via sitemap or link crawling |
| Analysis | Generates LLM test scenarios for each page |
| Execution | Runs scenarios with browser automation |
| Evaluation | Produces scored reports with findings |

### Validation Mode
Validates websites against specification documents through eight phases:

| Phase | Description |
|-------|-------------|
| Parsing | Parses specification document (markdown) |
| Extraction | Extracts testable requirements using LLM |
| Rubric | Generates evaluation rubric with pass/fail conditions |
| Discovery | Discovers site structure |
| Planning | Creates requirement-linked test plan |
| Execution | Runs tests with browser automation |
| Cross-Validation | Validates results against requirements |
| Reporting | Generates traceability report |

## Output

```
┌─────────────────────────────────────────┐
│  UI/UX QA Agent                         │
├─────────────────────────────────────────┤
│  ✓ Discovery   → Found 5 pages          │
│  ✓ Analysis    → 12 scenarios           │
│  ● Execution   → Running scenarios...   │
│  ○ Evaluation  → Pending                │
└─────────────────────────────────────────┘
```

Results include markdown reports, run metadata, and screenshots saved to `.ui-qa-runs/`.
