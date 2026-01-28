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
| `VISUAL_AUDITS` | `true` | Enable visual heuristic audits (overlapping elements, clipped text, etc.) |
| `STRICT_MODE` | `false` | Fail on any error (vs. skip and continue) |
| `CAPTURE_BEFORE_AFTER` | `true` | Capture screenshots before and after actions |
| `DEBUG` | `false` | Enable verbose logging |

### Coverage-Guided Exploration (Advanced)

Coverage-guided exploration is an advanced testing mode that uses state fingerprinting and coverage tracking to intelligently explore websites. It's disabled by default but can be enabled for more thorough testing.

| Variable | Default | Description |
|----------|---------|-------------|
| `COVERAGE_GUIDED` | `false` | Enable coverage-guided exploration engine |
| `EXPLORATION_MODE` | `coverage_guided` | Exploration strategy: `coverage_guided`, `breadth_first`, `depth_first`, `random` |
| `BEAM_WIDTH` | `3` | Number of top actions to explore in parallel (beam search width) |

#### Budget Configuration

Control exploration limits to prevent infinite loops and manage resource usage:

| Variable | Default | Description |
|----------|---------|-------------|
| `BUDGET_MAX_STEPS_PER_STATE` | `10` | Maximum steps allowed per unique page state |
| `BUDGET_MAX_UNIQUE_STATES` | `100` | Maximum unique states to visit |
| `BUDGET_MAX_TOTAL_STEPS` | `500` | Maximum total steps across all states |
| `BUDGET_STAGNATION_THRESHOLD` | `15` | Steps without coverage gain before stopping |
| `BUDGET_MAX_DEPTH` | `10` | Maximum exploration depth |
| `BUDGET_MAX_TIME_MS` | `600000` | Time limit in milliseconds (10 minutes) |

### Visual Audits

Visual audits detect UI/UX issues using fast browser-based heuristics:

| Variable | Default | Description |
|----------|---------|-------------|
| `VISUAL_AUDITS` | `true` | Enable visual heuristic audits |
| `BASELINE_DIR` | `.ui-qa/baselines` | Directory for storing screenshot baselines |
| `DIFF_THRESHOLD` | `5` | Visual diff threshold percentage (0-100) for regression detection |

**Visual Issues Detected:**
- Overlapping clickable elements
- Clipped text (overflow hidden)
- Small tap targets (< 44px)
- Off-screen primary CTAs
- Fixed headers covering content
- Horizontal overflow
- Missing focus indicators

### Auth Fixture Management

Save and reuse authentication states for testing authenticated areas:

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_FIXTURE_DIR` | `.ui-qa/auth-fixtures` | Directory for storing auth fixtures |
| `AUTH_FIXTURE` | - | Auth fixture ID or name to use for testing (optional) |

**Usage:**
1. Manually authenticate in browser
2. Save auth state: `ui-qa auth save my-fixture`
3. Use in tests: `AUTH_FIXTURE=my-fixture ui-qa https://app.example.com`

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

### Basic Configuration

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
VISUAL_AUDITS=true
CAPTURE_BEFORE_AFTER=true
DEBUG=false

# Custom viewports
VIEWPORTS=desktop:1920x1080,mobile:390x844
```

### Coverage-Guided Exploration Configuration

```ini
# Enable coverage-guided exploration
COVERAGE_GUIDED=true
EXPLORATION_MODE=coverage_guided
BEAM_WIDTH=3

# Budget limits
BUDGET_MAX_TOTAL_STEPS=1000
BUDGET_MAX_UNIQUE_STATES=200
BUDGET_STAGNATION_THRESHOLD=20
BUDGET_MAX_TIME_MS=900000  # 15 minutes

# Visual audits
VISUAL_AUDITS=true
BASELINE_DIR=.ui-qa/baselines
DIFF_THRESHOLD=5

# Auth fixtures
AUTH_FIXTURE_DIR=.ui-qa/auth-fixtures
AUTH_FIXTURE=production-user
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
