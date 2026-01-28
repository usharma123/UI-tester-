# UI/UX QA Agent

AI-powered terminal UI that tests websites using browser automation and LLM analysis. It drives a real browser, executes intelligent test plans, and generates detailed quality reports with screenshots.

## Features

- **Beautiful Terminal UI**: Interactive TUI built with Ink for a modern CLI experience
- **Intelligent Test Planning**: LLM generates test plans based on page content and goals
- **Coverage-Guided Exploration**: Advanced exploration engine with state fingerprinting and budget management
- **Business Logic Validation**: Validates websites against specification documents with requirement traceability
- **Real Browser Testing**: Uses Playwright for actual browser interaction
- **Sitemap Discovery**: Automatically discovers pages via sitemap.xml, robots.txt, or link crawling
- **Parallel Page Testing**: Tests multiple pages concurrently for faster results
- **Visual Audits**: Fast browser-based visual heuristics (overlapping elements, clipped text, tap targets)
- **State Tracking**: Detects revisits and tracks state transitions to avoid redundant testing
- **Auth Fixture Management**: Save and reuse authentication states for testing authenticated areas
- **Comprehensive Reports**: Scored reports with categorized issues and evidence
- **Screenshot Capture**: Automatic screenshots at key moments and on errors
- **Local Storage**: All results saved locally with markdown reports
- **Update Notifications**: Automatic checks for new versions

## Prerequisites

- [Bun](https://bun.sh/) or [Node.js](https://nodejs.org/) v18+ runtime
- [OpenRouter](https://openrouter.ai/) API key

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd ui-qa-agent

# Install dependencies
bun install
# or: pnpm install

# Install browser (first time only)
bunx playwright install chromium

# Set up environment
cp env.example .env
# Edit .env and add your OPENROUTER_API_KEY
```

## Usage

### UI/UX Testing Mode

```bash
# Start the TUI (interactive mode)
bun start

# Or with a URL directly
bun start https://example.com

# With custom goals
bun start https://example.com --goals "test checkout flow"

# Development mode (with hot reload)
bun dev

# Show help
bun start --help
```

### Business Logic Validation Mode

```bash
# Validate a website against a specification
bun start validate --spec ./requirements.md --url https://app.example.com

# With custom output directory
bun start validate -s ./prd.md -u https://staging.app.com -o ./reports

# Show validation help
bun start validate --help
```

### Interactive Mode

When you run without a URL, the TUI will prompt you to enter one:

1. Enter the URL you want to test
2. Watch the phases progress in real-time:
   - **Init**: Opens browser and takes initial screenshot
   - **Discovery**: Finds pages via sitemap or link crawling
   - **Planning**: Creates intelligent test plan using LLM
   - **Traversal**: Tests each discovered page
   - **Execution**: Runs additional planned tests
   - **Evaluation**: Generates final scored report
3. View results summary with score and issues

### Validation Mode

The validation mode validates a website against a specification document:

1. Provide a specification file (Markdown) and URL
2. Watch the validation phases:
   - **Parsing**: Parses specification document
   - **Extraction**: Extracts testable requirements using LLM
   - **Rubric**: Generates evaluation rubric
   - **Discovery**: Discovers site structure
   - **Planning**: Creates requirement-linked test plan
   - **Execution**: Runs tests with browser automation
   - **Cross-Validation**: Validates results against requirements
   - **Reporting**: Generates traceability report
3. View traceability report with requirement-to-evidence mapping

### Keyboard Shortcuts

- `Enter` - Submit URL / Continue
- `↑/↓` - Scroll through logs
- `r` - Retry after error
- `q` - Quit (when not running)

## Configuration

### Environment Variables

#### Required

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Yes | - | Your OpenRouter API key |

#### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-4.5` | LLM model to use |
| `MAX_STEPS` | `20` | Maximum test steps per page |
| `MAX_PAGES` | `50` | Maximum pages to test |
| `PARALLEL_BROWSERS` | `5` | Number of parallel browser instances (1-10) |
| `GOALS` | `homepage UX + primary CTA + form validation + keyboard` | Default test goals |
| `BROWSER_TIMEOUT` | `60000` | Browser command timeout (ms) |
| `NAVIGATION_TIMEOUT` | `45000` | Page load timeout (ms) |
| `ACTION_TIMEOUT` | `15000` | Click/fill action timeout (ms) |
| `DEBUG` | `false` | Enable verbose output |

#### Coverage-Guided Exploration (Advanced)

| Variable | Default | Description |
|----------|---------|-------------|
| `COVERAGE_GUIDED` | `false` | Enable coverage-guided exploration engine |
| `EXPLORATION_MODE` | `coverage_guided` | Strategy: `coverage_guided`, `breadth_first`, `depth_first`, `random` |
| `BEAM_WIDTH` | `3` | Beam width for beam search exploration |
| `BUDGET_MAX_STEPS_PER_STATE` | `10` | Max steps per unique page state |
| `BUDGET_MAX_UNIQUE_STATES` | `100` | Max unique states to visit |
| `BUDGET_MAX_TOTAL_STEPS` | `500` | Max total steps across all states |
| `BUDGET_STAGNATION_THRESHOLD` | `15` | Steps without coverage gain before stopping |
| `BUDGET_MAX_DEPTH` | `10` | Maximum exploration depth |
| `BUDGET_MAX_TIME_MS` | `600000` | Time limit in milliseconds (10 minutes) |

#### Visual Audits

| Variable | Default | Description |
|----------|---------|-------------|
| `VISUAL_AUDITS` | `true` | Enable visual heuristic audits |
| `BASELINE_DIR` | `.ui-qa/baselines` | Directory for screenshot baselines |
| `DIFF_THRESHOLD` | `5` | Visual diff threshold percentage (0-100) |

#### Auth Fixtures

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_FIXTURE_DIR` | `.ui-qa/auth-fixtures` | Directory for auth fixture storage |
| `AUTH_FIXTURE` | - | Auth fixture ID or name to use for testing |

### CLI Options

**Test Mode:**

| Option | Description |
|--------|-------------|
| `--goals <string>` | Test goals to focus on |
| `--help, -h` | Show help message |

**Validation Mode:**

| Option | Description |
|--------|-------------|
| `--spec, -s <file>` | Path to requirements/specification file (required) |
| `--url, -u <url>` | URL to validate against (required) |
| `--output, -o <dir>` | Output directory for reports (default: ./reports) |
| `--help, -h` | Show help message |

## Output

### Test Mode Output

Results are saved to `.ui-qa-runs/<run-id>/`:

```
.ui-qa-runs/
└── cli-1234567890/
    ├── run.json          # Run metadata and status
    ├── report.json       # Full report with scores and issues
    ├── evidence.json     # Detailed execution evidence
    ├── report.md         # Human-readable markdown report
    ├── llm-fix.txt       # Instructions for AI to fix issues
    └── screenshots/      # All captured screenshots
        ├── 00-initial.png
        ├── step-01-after.png
        └── ...
```

**Report Contents:**
- **Score**: 0-100 quality score
- **Summary**: Overall assessment
- **Issues**: Categorized problems with:
  - Severity (critical, high, medium, low)
  - Category (accessibility, usability, performance, etc.)
  - Reproduction steps
  - Suggested fixes
  - Screenshot evidence

### Validation Mode Output

Results are saved to the specified output directory (default: `./reports`):

```
reports/
└── validation-1234567890/
    ├── traceability-report.json    # Complete validation report
    ├── traceability-report.md      # Human-readable summary
    └── screenshots/                # Evidence linked to requirements
        ├── req-001-login.png
        └── ...
```

**Report Contents:**
- **Requirements**: All extracted requirements with IDs, priorities, and acceptance criteria
- **Rubric**: Evaluation criteria with pass/fail conditions
- **Results**: Requirement validation results with:
  - Status (pass/partial/fail/not_tested)
  - Score (0-100 per requirement)
  - Evidence screenshots
  - Reasoning
- **Overall Score**: Weighted average based on rubric weights
- **Coverage Score**: Percentage of requirements successfully tested
- **Traceability**: Links requirements to test evidence

## Project Structure

```
.
├── src/
│   ├── cli-ink.tsx         # TUI entry point
│   ├── config.ts           # Configuration management
│   ├── agentBrowser.ts     # Browser automation wrapper
│   ├── ink/                # TUI components
│   │   ├── App.tsx         # Main TUI application (test mode)
│   │   ├── ValidateApp.tsx # Validation mode TUI
│   │   ├── components/     # UI components
│   │   │   ├── Header.tsx
│   │   │   ├── UrlInput.tsx
│   │   │   ├── PhaseIndicator.tsx
│   │   │   ├── TaskList.tsx
│   │   │   ├── LogStream.tsx
│   │   │   ├── ResultsSummary.tsx
│   │   │   ├── RequirementList.tsx
│   │   │   ├── RubricDisplay.tsx
│   │   │   ├── TraceabilityReport.tsx
│   │   │   └── ValidationProgress.tsx
│   │   └── hooks/
│   │       ├── useQARunner.ts
│   │       └── useValidationRunner.ts
│   ├── qa/                 # QA core logic
│   │   ├── planner.ts      # Test plan generation
│   │   ├── executor.ts     # Test execution
│   │   ├── judge.ts        # Result evaluation
│   │   ├── run-streaming.ts # Streaming run orchestrator
│   │   ├── parallelTester.ts # Parallel page testing
│   │   └── types.ts        # Type definitions
│   ├── validation/         # Validation feature
│   │   ├── run-validation.ts # Validation orchestrator
│   │   ├── extractor.ts    # Requirement extraction
│   │   ├── rubric-generator.ts # Rubric generation
│   │   ├── cross-validator.ts # Cross-validation
│   │   ├── traceability.ts # Report generation
│   │   ├── parsers/        # Document parsers
│   │   └── types.ts        # Validation types
│   ├── prompts/            # LLM prompts
│   │   ├── planner.ts
│   │   ├── judge.ts
│   │   ├── extractor.ts
│   │   ├── rubric.ts
│   │   └── cross-validator.ts
│   ├── updates/            # Update checking
│   │   ├── checker.ts
│   │   └── types.ts
│   ├── storage/
│   │   └── local.ts        # Local file storage
│   └── utils/              # Utility functions
│       ├── browserPool.ts  # Browser instance pooling
│       ├── sitemap.ts      # Sitemap parsing
│       └── ...
├── tests/                  # Test files
├── .ui-qa-runs/           # Generated results (gitignored)
└── package.json
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Terminal UI (Ink)                        │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐   │
│  │URL Input │ │  Phases   │ │   Logs   │ │   Results    │   │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     QA Pipeline                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐               │
│  │  Planner   │ │  Executor  │ │   Judge    │               │
│  │   (LLM)    │→│ (Browser)  │→│   (LLM)    │               │
│  └────────────┘ └────────────┘ └────────────┘               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Coverage-Guided Exploration                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ Coverage │ │  State   │ │  Budget  │ │  Explorer    │    │
│  │ Tracker  │ │ Tracker  │ │ Tracker  │ │  Engine      │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Local Storage                            │
│  Screenshots • Reports • Evidence • Markdown                │
└─────────────────────────────────────────────────────────────┘
```

### Pipeline Components

**Test Mode:**
1. **Planner**: Analyzes page DOM and creates intelligent test plans using LLM
2. **Executor**: Runs the plan step-by-step using real browser automation
3. **Judge**: Evaluates test evidence and generates scored reports with issues

**Coverage-Guided Exploration (Advanced):**
1. **Coverage Tracker**: Monitors URLs, forms, dialogs, and interactions visited
2. **State Tracker**: Fingerprints page states to detect revisits and transitions
3. **Budget Tracker**: Enforces exploration limits (steps, states, time, stagnation)
4. **Action Selector**: Scores actions by novelty, business criticality, risk, and branch factor
5. **Explorer Engine**: Executes coverage-guided exploration with beam search and backtracking

**Validation Mode:**
1. **Parser**: Parses specification documents (Markdown)
2. **Extractor**: Uses LLM to extract testable requirements
3. **Rubric Generator**: Creates evaluation rubrics with pass/fail conditions
4. **Planner**: Creates requirement-linked test plans
5. **Executor**: Runs tests with browser automation
6. **Cross-Validator**: Validates test results against requirements
7. **Report Generator**: Creates traceability reports linking requirements to evidence

## Building for Distribution

```bash
# Build the CLI binary
bun run build

# The built CLI will be in dist/cli-ink.js
# You can run it with: node dist/cli-ink.js
```

## Publishing to npm

```bash
# Build and publish
bun run prepublishOnly
npm publish
```

After publishing, users can install and run:

```bash
npx @utsav/ui-qa https://example.com
```

## Safety

- Only uses dummy data for forms (`test@example.com`, "Test User")
- Never submits payment forms
- Redacts sensitive data from snapshots before LLM processing
- Timeouts on all browser operations

## Troubleshooting

### Browser Installation

If browser commands fail:

```bash
# Reinstall browser
bunx playwright install chromium
```

### API Key Issues

Make sure your `.env` file contains:

```
OPENROUTER_API_KEY=sk-or-v1-...
```

### Debug Mode

For verbose output:

```bash
DEBUG=true bun start https://example.com
```

## License

MIT
