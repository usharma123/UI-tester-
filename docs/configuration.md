# Configuration

UI QA is configured through environment variables. This page documents all available options and their defaults.

## API Key

An [OpenRouter](https://openrouter.ai/) API key is required.

### Setting the Key

```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Or create a `.env` file:

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

### LLM Model

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_MODEL` | Test mode: `anthropic/claude-sonnet-4.5`<br/>Validation mode: `anthropic/claude-sonnet-4` | Model identifier used for LLM calls |

### Test Mode Scope

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_PAGES` | `20` | Maximum pages to test (discovery limit) |
| `MAX_SCENARIOS_PER_PAGE` | `5` | Maximum scenarios generated per page |
| `MAX_STEPS_PER_SCENARIO` | `10` | Maximum steps executed per scenario |
| `PARALLEL_BROWSERS` | `3` | Concurrent browser instances (clamped 1-10) |
| `GOALS` | `homepage UX + primary CTA + form validation + keyboard` | LLM test objectives |
| `HEADLESS` | `true` | Run browser headless (`false` for headed mode) |

### Validation Mode Scope

Validation mode uses the same environment variables, but defaults differ:

| Variable | Default (Validation Mode) | Description |
|----------|---------------------------|-------------|
| `MAX_PAGES` | `50` | Maximum pages to test |
| `MAX_SCENARIOS_PER_PAGE` | `8` | Maximum scenarios generated per page |
| `MAX_STEPS_PER_SCENARIO` | `14` | Maximum agent steps per scenario |
| `PARALLEL_BROWSERS` | `5` | Concurrent browser instances |
| `VALIDATION_GAP_ROUNDS` | `4` | Iterative uncovered-requirement planning rounds |
| `VALIDATION_GAP_PAGES_PER_ROUND` | `3` | Max pages targeted per gap round |
| `VALIDATION_MAX_TOTAL_SCENARIOS` | `60` | Hard cap on total generated scenarios |
| `VALIDATION_ENABLE_PROBES` | `true` | Enable deterministic post-execution probes |
| `VALIDATION_PERF_LOAD_BUDGET_MS` | `2000` | Performance probe load-time budget |
| `VALIDATION_PERF_UI_BUDGET_MS` | `100` | Performance probe UI-latency budget |

### Timeouts

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSER_TIMEOUT` | `60000` | General browser timeout (ms) |
| `NAVIGATION_TIMEOUT` | `45000` | Page load timeout (ms) |
| `ACTION_TIMEOUT` | `15000` | Click/fill action timeout (ms) |
| `SCENARIO_TIMEOUT_MS` | `max(BROWSER_TIMEOUT * 4, 180000)` | Per-scenario timeout in validation mode |
| `LLM_TIMEOUT_MS` | `60000` | Default timeout for LLM calls |
| `CROSS_VALIDATION_TIMEOUT_MS` | `LLM_TIMEOUT_MS` or `90000` fallback | Timeout for validation cross-check requests |

### Retry Behavior

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_RETRIES` | `3` | Retry attempts for transient failures (test mode only) |
| `RETRY_DELAY_MS` | `1000` | Initial retry delay (doubles each attempt, test mode only) |

### Debugging

| Variable | Default | Description |
|----------|---------|-------------|
| `DEBUG` | `false` | Enable verbose debug output |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `JSON_LOGS` | `true` | Write streaming JSON logs to `.ui-qa-runs/<run-id>/events.jsonl` (`false` to disable) |

## Example Configuration

```ini
# Required
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Model
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5

# Test scope
MAX_PAGES=25
MAX_SCENARIOS_PER_PAGE=6
MAX_STEPS_PER_SCENARIO=12
PARALLEL_BROWSERS=4
GOALS=navigation + forms + mobile responsiveness
HEADLESS=true

# Timeouts
BROWSER_TIMEOUT=60000
NAVIGATION_TIMEOUT=45000
ACTION_TIMEOUT=15000
SCENARIO_TIMEOUT_MS=180000
LLM_TIMEOUT_MS=60000
CROSS_VALIDATION_TIMEOUT_MS=90000

# Retries
MAX_RETRIES=3
RETRY_DELAY_MS=1000

# Logging
JSON_LOGS=true

# Debug
DEBUG=false
```

## CI/CD Integration

```yaml
- name: Run UI QA
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    MAX_PAGES: 10
    PARALLEL_BROWSERS: 2
  run: npx @usharma124/ui-qa https://staging.example.com
```
