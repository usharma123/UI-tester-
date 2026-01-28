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
  - title: Intelligent Test Planning
    details: Generates context-aware test plans by analyzing page structure and content
  - title: Coverage-Guided Exploration
    details: Advanced exploration engine with state fingerprinting and budget management
  - title: Real Browser Automation
    details: Executes tests using Playwright with actual clicks, form inputs, and navigation
  - title: Visual Audits
    details: Fast browser-based heuristics detect overlapping elements, clipped text, and UI issues
  - title: Business Logic Validation
    details: Validates websites against specification documents with requirement traceability
  - title: Multi-Viewport Testing
    details: Tests desktop, tablet, and mobile viewports automatically with configurable sizes
  - title: Auth Fixture Management
    details: Save and reuse authentication states for testing authenticated areas
  - title: Visual Documentation
    details: Captures screenshots before and after each action for debugging and evidence
  - title: Concurrent Execution
    details: Tests multiple pages in parallel with configurable browser pool (1-10 instances)
  - title: Comprehensive Reporting
    details: Scored reports with categorized issues, reproduction steps, and fix recommendations
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
| Planning | Generates test plans using LLM analysis |
| Execution | Runs tests with browser automation |
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
│  ✓ Init        → Browser ready          │
│  ✓ Discovery   → Found 5 pages          │
│  ✓ Planning    → 12 test steps          │
│  ● Execution   → Running tests...       │
│  ○ Evaluation  → Pending                │
└─────────────────────────────────────────┘
```

Results include markdown reports, JSON data, and screenshots saved to `.ui-qa-runs/`.
