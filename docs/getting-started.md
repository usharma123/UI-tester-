# Getting Started

UI QA is an AI-powered CLI tool that tests websites using real browser automation and LLM analysis. This guide covers installation and your first test run.

## Prerequisites

- **Node.js 18+** or [Bun](https://bun.sh/) runtime
- **OpenRouter API key** - [Get one here](https://openrouter.ai/)

## Installation Options

### Option 1: Run with npx (Recommended)

No installation required. Just run:

```bash
npx @usharma124/ui-qa https://example.com
```

The first run will:
- Download the package temporarily
- Prompt you for your OpenRouter API key
- Install Chromium browser if needed

### Option 2: Global Installation

Install globally for faster subsequent runs:

```bash
# Using npm
npm install -g @usharma124/ui-qa

# Using bun
bun add -g @usharma124/ui-qa

# Using pnpm
pnpm add -g @usharma124/ui-qa
```

Then run from anywhere:

```bash
ui-qa https://example.com
```

### Option 3: Project Dependency

Add to your project for CI/CD integration:

```bash
# Using npm
npm install --save-dev @usharma124/ui-qa

# Using bun
bun add -D @usharma124/ui-qa
```

Add a script to your `package.json`:

```json
{
  "scripts": {
    "test:ui": "ui-qa https://your-staging-url.com"
  }
}
```

## Browser Installation

On first run, you may need to install the browser:

```bash
npx playwright install chromium
```

This downloads a compatible Chromium browser that Playwright controls.

## Your First Test

1. **Set your API key** (see [Configuration](/configuration) for options):

```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

2. **Run a test**:

```bash
npx @usharma124/ui-qa https://example.com
```

3. **Watch the TUI** as it:
   - Opens a browser
   - Discovers pages
   - Plans tests
   - Executes them
   - Generates a report

4. **View results** in `.ui-qa-runs/` directory:
   - `report.md` - Human-readable report
   - `report.json` - Structured data
   - `screenshots/` - Visual evidence

## Next Steps

- [Configure environment variables](/configuration)
- [Learn CLI options and usage](/usage)
