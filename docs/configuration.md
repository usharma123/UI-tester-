# Configuration

UI QA is configured through environment variables. This page covers all available options.

## API Key Setup

You need an [OpenRouter](https://openrouter.ai/) API key to use UI QA. OpenRouter provides access to various LLM models (GPT-4, Claude, Gemini, etc.) through a unified API.

### Getting an API Key

1. Go to [openrouter.ai](https://openrouter.ai/)
2. Sign up or log in
3. Navigate to **Keys** in the dashboard
4. Create a new API key
5. Copy the key (starts with `sk-or-v1-`)

### Setting the API Key

Choose one of these methods:

#### Method 1: Environment Variable (Recommended for CI/CD)

```bash
# Add to your shell profile (~/.bashrc, ~/.zshrc, etc.)
export OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Or set for a single command
OPENROUTER_API_KEY=sk-or-v1-your-key-here npx @usharma124/ui-qa https://example.com
```

#### Method 2: .env File (Recommended for Local Development)

Create a `.env` file in your working directory:

```bash
# Create the file
echo "OPENROUTER_API_KEY=sk-or-v1-your-key-here" > .env

# Or edit manually
nano .env
```

Contents of `.env`:

```ini
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

::: warning Keep Your Key Secret
Never commit `.env` files to version control. Add `.env` to your `.gitignore`.
:::

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | **Yes** | - | Your OpenRouter API key |
| `OPENROUTER_MODEL` | No | `google/gemini-2.5-flash` | LLM model to use |
| `MAX_STEPS` | No | `20` | Maximum test steps per page |
| `MAX_PAGES` | No | `10` | Maximum pages to discover and test |
| `PARALLEL_BROWSERS` | No | `3` | Number of concurrent browser instances |
| `GOALS` | No | See below | Default testing goals |
| `BROWSER_TIMEOUT` | No | `30000` | Browser command timeout in ms |
| `DEBUG` | No | `false` | Enable verbose logging |

### Default Goals

When no goals are specified, UI QA tests:

```
homepage UX + primary CTA + form validation + keyboard accessibility
```

## Model Selection

OpenRouter supports many models. Some good options:

```bash
# Fast and cost-effective (default)
OPENROUTER_MODEL=google/gemini-2.5-flash

# More capable, higher cost
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet

# OpenAI option
OPENROUTER_MODEL=openai/gpt-4o
```

See [OpenRouter Models](https://openrouter.ai/models) for the full list.

## Example .env File

Here's a complete example configuration:

```ini
# Required
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Optional customizations
OPENROUTER_MODEL=google/gemini-2.5-flash
MAX_STEPS=30
MAX_PAGES=15
PARALLEL_BROWSERS=4
GOALS=test navigation + forms + mobile responsiveness
BROWSER_TIMEOUT=60000
DEBUG=false
```

## CI/CD Integration

For CI/CD pipelines, set environment variables in your platform:

### GitHub Actions

```yaml
- name: Run UI QA
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
  run: npx @usharma124/ui-qa https://staging.example.com
```

### Vercel

Add `OPENROUTER_API_KEY` in Project Settings → Environment Variables.

### Other Platforms

Most CI platforms support environment variables. Consult your platform's documentation for setting secrets.
