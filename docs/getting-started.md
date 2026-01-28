# Getting Started

UI QA is a command-line tool for automated UI/UX testing. It uses browser automation and LLM analysis to identify issues across your website.

## Prerequisites

- Node.js 18 or later (or [Bun](https://bun.sh/))
- [OpenRouter API key](https://openrouter.ai/)

## Installation

### Using npx (Recommended)

Run without installation:

```bash
npx @usharma124/ui-qa https://example.com
```

### Global Installation

Install for repeated use:

::: code-group

```bash [npm]
npm install -g @usharma124/ui-qa
```

```bash [bun]
bun add -g @usharma124/ui-qa
```

```bash [pnpm]
pnpm add -g @usharma124/ui-qa
```

:::

Then run from any directory:

```bash
ui-qa https://example.com
```

### Project Dependency

Add to your project for CI/CD integration:

::: code-group

```bash [npm]
npm install --save-dev @usharma124/ui-qa
```

```bash [bun]
bun add -D @usharma124/ui-qa
```

:::

Add a script to `package.json`:

```json
{
  "scripts": {
    "test:ui": "ui-qa https://staging.example.com"
  }
}
```

## Browser Setup

Install Chromium on first run:

```bash
npx playwright install chromium
```

## Running Your First Test

1. Set your API key:

```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

2. Run a test:

```bash
# UI/UX testing mode (default)
npx @usharma124/ui-qa https://example.com

# Business logic validation mode
npx @usharma124/ui-qa validate --spec requirements.md --url https://app.example.com
```

3. View results:

**Test Mode** - Results in `.ui-qa-runs/`:
| File | Contents |
|------|----------|
| `report.md` | Human-readable report |
| `report.json` | Structured data |
| `screenshots/` | Visual evidence |

**Validation Mode** - Results in specified output directory:
| File | Contents |
|------|----------|
| `traceability-report.json` | Complete validation report |
| `traceability-report.md` | Human-readable summary |
| `screenshots/` | Visual evidence |

## Next Steps

- [Configure environment variables](/configuration)
- [Learn CLI options](/usage)
- [Learn about validation mode](/usage#validation-mode)
