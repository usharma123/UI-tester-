---
layout: home

hero:
  name: "UI QA"
  text: "AI-Powered UI/UX Testing"
  tagline: Test any website with intelligent browser automation and LLM analysis
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/usharma124/UI-tester-

features:
  - icon: 🤖
    title: AI-Powered Testing
    details: LLM generates intelligent test plans based on page content and your goals
  - icon: 🌐
    title: Real Browser Testing
    details: Uses Playwright for actual browser interaction - clicks, forms, navigation
  - icon: 📊
    title: Comprehensive Reports
    details: Scored reports with categorized issues, reproduction steps, and fix suggestions
  - icon: 📸
    title: Visual Evidence
    details: Automatic screenshots at key moments and on errors for debugging
  - icon: ⚡
    title: Parallel Testing
    details: Tests multiple pages concurrently for faster results
  - icon: 🔍
    title: Sitemap Discovery
    details: Automatically discovers pages via sitemap.xml, robots.txt, or link crawling
---

## Quick Start

Run UI QA instantly with npx - no installation required:

```bash
# Test any website
npx @usharma124/ui-qa https://example.com

# With custom testing goals
npx @usharma124/ui-qa https://example.com --goals "test checkout flow"
```

::: warning API Key Required
You'll need an [OpenRouter API key](https://openrouter.ai/) to use UI QA. See the [Configuration](/configuration) page for setup instructions.
:::

## What It Does

UI QA analyzes websites through these phases:

1. **Discovery** - Finds all pages via sitemap or link crawling
2. **Planning** - LLM creates intelligent test plans for each page
3. **Execution** - Real browser runs the tests with screenshots
4. **Evaluation** - LLM evaluates results and generates scored report

## Sample Output

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

Results are saved locally with detailed markdown reports, screenshots, and JSON data for programmatic access.
