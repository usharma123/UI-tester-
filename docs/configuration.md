# Configuration

UI QA is configured through environment variables. This page documents all available options.

## API Key

An [OpenRouter](https://openrouter.ai/) API key is required. OpenRouter provides unified access to various LLM providers including OpenAI, Anthropic, and Google.

### Obtaining a Key

1. Visit [openrouter.ai](https://openrouter.ai/)
2. Create an account or sign in
3. Navigate to **Keys** in the dashboard
4. Generate a new key (format: `sk-or-v1-...`)

### Setting the Key

#### Environment Variable

```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Add to your shell profile (`~/.bashrc`, `~/.zshrc`) for persistence.

#### .env File

Create a `.env` file in your working directory:

```ini
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

::: warning Security
Add `.env` to `.gitignore` to avoid committing credentials.
:::

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | API key for LLM access |

### LLM Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-4.5` | Model identifier |
| `GOALS` | `homepage UX + primary CTA + form validation + keyboard` | Testing objectives |

### Test Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_STEPS` | `20` | Maximum total test steps |
| `MAX_PAGES` | `50` | Maximum pages to discover and test |
| `STEPS_PER_PAGE` | `5` | Maximum steps per individual page |
| `PARALLEL_BROWSERS` | `5` | Concurrent browser instances (1–10) |

### Timeouts

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSER_TIMEOUT` | `60000` | General browser timeout (ms) |
| `NAVIGATION_TIMEOUT` | `45000` | Page load timeout (ms) |
| `ACTION_TIMEOUT` | `15000` | Click/fill action timeout (ms) |

### Retry Behavior

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_RETRIES` | `3` | Retry attempts before skipping |
| `RETRY_DELAY_MS` | `1000` | Initial retry delay (doubles each attempt) |

### Features

| Variable | Default | Description |
|----------|---------|-------------|
| `AUDITS_ENABLED` | `true` | Run accessibility and performance audits |
| `STRICT_MODE` | `false` | Fail on any error (vs. skip and continue) |
| `CAPTURE_BEFORE_AFTER` | `true` | Capture screenshots before and after actions |
| `DEBUG` | `false` | Enable verbose logging |

### Viewports

UI QA tests three viewport sizes by default:

| Viewport | Dimensions |
|----------|------------|
| Desktop | 1365×768 |
| Tablet | 820×1180 |
| Mobile | 390×844 |

Override with the `VIEWPORTS` variable:

```bash
VIEWPORTS="desktop:1920x1080,tablet:768x1024,mobile:375x667"
```

Format: `label:WIDTHxHEIGHT` separated by commas. The label is optional.

## Model Selection

Supported models include:

| Model | Identifier | Notes |
|-------|------------|-------|
| Claude Sonnet 4.5 | `anthropic/claude-sonnet-4.5` | Default |
| Claude 3.5 Sonnet | `anthropic/claude-3.5-sonnet` | Previous generation |
| Gemini 2.5 Flash | `google/gemini-2.5-flash` | Cost-effective |
| GPT-4o | `openai/gpt-4o` | OpenAI option |

See [OpenRouter Models](https://openrouter.ai/models) for the complete list.

## Example Configuration

```ini
# Required
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Model
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5

# Test scope
MAX_PAGES=25
STEPS_PER_PAGE=8
PARALLEL_BROWSERS=4
GOALS=navigation + forms + mobile responsiveness

# Timeouts
BROWSER_TIMEOUT=60000
NAVIGATION_TIMEOUT=45000
ACTION_TIMEOUT=15000

# Retries
MAX_RETRIES=3
RETRY_DELAY_MS=1000

# Features
AUDITS_ENABLED=true
CAPTURE_BEFORE_AFTER=true
DEBUG=false

# Custom viewports
VIEWPORTS=desktop:1920x1080,mobile:390x844
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run UI QA
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    MAX_PAGES: 10
    PARALLEL_BROWSERS: 2
  run: npx @usharma124/ui-qa https://staging.example.com
```

### Other Platforms

Set `OPENROUTER_API_KEY` as a secret or environment variable in your CI configuration.
