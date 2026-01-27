# Usage

This page covers CLI options, interactive mode, and understanding the output.

## Basic Usage

```bash
# Test a website
npx @usharma124/ui-qa https://example.com

# With custom goals
npx @usharma124/ui-qa https://example.com --goals "test checkout flow"

# Show help
npx @usharma124/ui-qa --help
```

## CLI Options

| Option | Description |
|--------|-------------|
| `--goals <string>` | Specify testing goals (overrides env var) |
| `--help`, `-h` | Show help message |

### Examples

```bash
# Test e-commerce checkout
npx @usharma124/ui-qa https://shop.example.com --goals "add to cart, checkout flow, payment form"

# Test accessibility
npx @usharma124/ui-qa https://example.com --goals "keyboard navigation, screen reader, color contrast"

# Test forms
npx @usharma124/ui-qa https://example.com --goals "form validation, error messages, required fields"
```

## Interactive Mode

When you run without a URL, the TUI prompts you:

```bash
npx @usharma124/ui-qa
```

The interactive mode shows:
- URL input field
- Real-time phase progress
- Scrollable log stream
- Final results summary

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit URL / Continue |
| `↑/↓` | Scroll through logs |
| `r` | Retry after error |
| `q` | Quit (when not running) |

## Testing Phases

UI QA runs through these phases:

### 1. Init
Opens a headless browser and takes an initial screenshot.

### 2. Discovery
Finds pages to test via:
- `sitemap.xml` (preferred)
- `robots.txt` sitemap references
- Link crawling from homepage

### 3. Planning
The LLM analyzes each page and creates a test plan:
- Identifies interactive elements
- Plans test sequences
- Considers your goals

### 4. Execution
Runs tests using real browser automation:
- Clicks buttons and links
- Fills forms (with safe dummy data)
- Takes screenshots at each step
- Captures errors and console output

### 5. Evaluation
The LLM evaluates all evidence and generates:
- Overall score (0-100)
- Categorized issues
- Reproduction steps
- Fix suggestions

## Output Files

Results are saved to `.ui-qa-runs/<run-id>/`:

```
.ui-qa-runs/
└── cli-1234567890/
    ├── run.json          # Run metadata
    ├── report.json       # Full structured report
    ├── evidence.json     # Detailed execution data
    ├── report.md         # Human-readable report
    ├── llm-fix.txt       # AI fix instructions
    └── screenshots/
        ├── 00-initial.png
        ├── step-01-after.png
        └── ...
```

### Report Structure

The `report.json` contains:

```json
{
  "score": 85,
  "summary": "Overall assessment...",
  "issues": [
    {
      "severity": "high",
      "category": "accessibility",
      "title": "Missing form labels",
      "description": "...",
      "reproduction": ["Step 1...", "Step 2..."],
      "suggestion": "Add aria-label attributes...",
      "screenshot": "step-03-after.png"
    }
  ]
}
```

### Issue Categories

- **accessibility** - ARIA, keyboard nav, screen readers
- **usability** - UX problems, confusing flows
- **functionality** - Broken features, errors
- **performance** - Slow loading, janky animations
- **visual** - Layout issues, responsive problems

### Severity Levels

- **critical** - Site unusable, major breakage
- **high** - Significant problems affecting users
- **medium** - Notable issues worth fixing
- **low** - Minor improvements

## Safety Features

UI QA is designed to be safe:

- **Dummy data only** - Forms use `test@example.com`, "Test User"
- **No payments** - Never submits payment forms
- **Data redaction** - Sensitive data removed before LLM processing
- **Timeouts** - All browser operations have timeouts
- **Headless** - No visible browser window

## Debugging

Enable verbose output:

```bash
DEBUG=true npx @usharma124/ui-qa https://example.com
```

This shows:
- LLM prompts and responses
- Browser commands
- Screenshot paths
- Timing information

## Tips

### Effective Goals

Be specific about what you want to test:

```bash
# Good - specific and actionable
--goals "login flow, password reset, session timeout"

# Less effective - too vague
--goals "test everything"
```

### Testing Staging Sites

Point to your staging environment for safe testing:

```bash
npx @usharma124/ui-qa https://staging.yoursite.com
```

### Interpreting Scores

- **90-100**: Excellent - minor polish items only
- **70-89**: Good - some issues to address
- **50-69**: Fair - significant problems found
- **Below 50**: Poor - major issues need attention
