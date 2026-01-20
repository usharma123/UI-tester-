# UI/UX QA Agent

AI-powered CLI tool that tests websites using browser automation and LLM analysis. It drives a real browser, executes intelligent test plans, and generates detailed quality reports with screenshots.

## Features

- **Intelligent Test Planning**: LLM generates test plans based on page content and goals
- **Real Browser Testing**: Uses `agent-browser` for actual browser interaction
- **Comprehensive Reports**: Scored reports with categorized issues and evidence
- **Screenshot Capture**: Automatic screenshots at key moments and on errors
- **Flexible Configuration**: Customizable goals, steps, and models

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [OpenRouter](https://openrouter.ai/) API key

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd ui-qa-agent

# Install dependencies
bun install

# Install browser (first time only)
bunx agent-browser install

# Set up environment
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY
```

## Usage

```bash
# Basic usage
bun run qa https://example.com

# With custom goals
bun run qa https://example.com --goals "test login flow + form validation"

# With step limit
bun run qa https://example.com --maxSteps 10

# With specific model
bun run qa https://example.com --model "anthropic/claude-3-haiku"

# Show help
bun run qa --help
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Yes | - | Your OpenRouter API key |
| `OPENROUTER_MODEL` | No | `google/gemini-3-flash` | Default LLM model |
| `MAX_STEPS` | No | `20` | Maximum test steps |
| `GOALS` | No | `homepage UX + primary CTA + form validation + keyboard` | Default test goals |
| `SCREENSHOT_DIR` | No | `screenshots/` | Screenshot output directory |
| `REPORT_DIR` | No | `reports/` | Report output directory |
| `BROWSER_TIMEOUT` | No | `30000` | Browser command timeout (ms) |
| `DEBUG` | No | `false` | Enable verbose output |

### CLI Options

| Option | Description |
|--------|-------------|
| `--goals <string>` | Test goals to focus on |
| `--maxSteps <number>` | Maximum steps to execute |
| `--model <string>` | OpenRouter model to use |
| `--help` | Show help message |

## Output

### Reports

Reports are saved to `reports/<timestamp>-report.json` with:

- **Score**: 0-100 quality score
- **Summary**: Overall assessment
- **Issues**: Categorized problems with severity, repro steps, and suggested fixes
- **Artifacts**: Paths to screenshots and evidence files

### Screenshots

Screenshots are saved to `screenshots/<timestamp>/`:

- `00-initial.png`: Initial page load
- `step-XX-after.png`: After major interactions
- `step-XX-error.png`: When errors occur

### Evidence

Raw test evidence is saved to `reports/<timestamp>-evidence.json` containing:

- Executed plan and steps
- DOM snapshots
- Error logs
- Screenshot mapping

## Architecture

```
CLI → Run Orchestrator → Planner (LLM) → Executor (Browser) → Judge (LLM) → Report
```

1. **Planner**: Analyzes the page and creates a test plan
2. **Executor**: Runs the plan step-by-step with the browser
3. **Judge**: Evaluates evidence and generates a scored report

## Testing

```bash
# Run tests
bun test
```

## Safety

- Only uses dummy data for forms (`test@example.com`, "Test User")
- Never submits payment forms
- Redacts sensitive data from snapshots before LLM processing
- Timeouts on all browser operations
