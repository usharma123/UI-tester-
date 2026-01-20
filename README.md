# UI/UX QA Agent

AI-powered CLI tool and web interface that tests websites using browser automation and LLM analysis. It drives a real browser, executes intelligent test plans, and generates detailed quality reports with screenshots.

## Features

- **Intelligent Test Planning**: LLM generates test plans based on page content and goals
- **Real Browser Testing**: Uses `agent-browser` for actual browser interaction
- **Comprehensive Reports**: Scored reports with categorized issues and evidence
- **Screenshot Capture**: Automatic screenshots at key moments and on errors
- **Web Interface**: Modern web UI for running tests and viewing results
- **Convex Backend**: Persistent storage for test runs and screenshots
- **Flexible Configuration**: Customizable goals, steps, and models

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [OpenRouter](https://openrouter.ai/) API key
- [Convex](https://www.convex.dev/) account (for web interface)

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

### Convex Setup (for Web Interface)

The project uses Convex for backend storage. The `convex.config.ts` file is already configured.

```bash
# Initialize Convex (if not already done)
npx convex dev

# This will:
# - Create a Convex deployment
# - Push your schema and functions
# - Set up the database
```

Make sure you have:
- Created a Convex account at https://www.convex.dev
- Run `npx convex dev` to initialize your deployment
- Added your Convex deployment URL to your environment (if needed)

## Usage

### CLI Usage

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

### Web Interface

```bash
# Start the web server
bun run web

# The web interface will be available at http://localhost:3000
# Features:
# - Run tests via web UI
# - View test history
# - Browse screenshots and reports
# - Real-time test progress via SSE
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
| `PORT` | No | `3000` | Web server port |
| `DEBUG` | No | `false` | Enable verbose output |

### CLI Options

| Option | Description |
|--------|-------------|
| `--goals <string>` | Test goals to focus on |
| `--maxSteps <number>` | Maximum steps to execute |
| `--model <string>` | OpenRouter model to use |
| `--help` | Show help message |

## Project Structure

```
.
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── config.ts           # Configuration management
│   ├── agentBrowser.ts     # Browser automation wrapper
│   ├── qa/                 # QA core logic
│   │   ├── planner.ts      # Test plan generation
│   │   ├── executor.ts     # Test execution
│   │   ├── judge.ts        # Result evaluation
│   │   ├── run.ts          # CLI run orchestrator
│   │   └── run-streaming.ts # Web streaming run orchestrator
│   ├── web/                # Web interface
│   │   ├── server.ts       # HTTP server with SSE
│   │   ├── convex.ts       # Convex client integration
│   │   └── types.ts        # Type definitions
│   └── utils/              # Utility functions
├── convex/                 # Convex backend
│   ├── convex.config.ts   # Convex app configuration
│   ├── schema.ts           # Database schema
│   ├── runs.ts             # Run management functions
│   └── screenshots.ts      # Screenshot management functions
├── public/                 # Web UI static files
│   ├── index.html         # Main HTML page
│   ├── app.js             # Frontend JavaScript
│   └── styles.css         # Styling
├── screenshots/            # Generated screenshots
└── reports/                # Generated reports
```

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
                                                                    ↓
Web UI → HTTP Server → Convex Backend ←────────────────────────────┘
```

1. **Planner**: Analyzes the page and creates a test plan
2. **Executor**: Runs the plan step-by-step with the browser
3. **Judge**: Evaluates evidence and generates a scored report
4. **Convex Backend**: Stores runs, screenshots, and reports for web UI

## Convex Functions

The project includes Convex functions for:

- **Runs Management**: Store and query test runs
- **Screenshots**: Manage screenshot storage and retrieval
- **Schema**: Define data models for runs and screenshots

See `convex/` directory for implementation details.

## Testing

```bash
# Run tests
bun test
```

## Troubleshooting

### Convex Import Error

If you see `Could not resolve "convex/server"`:

1. Ensure `convex.config.ts` exists in the `convex/` directory
2. Run `bun install` to ensure dependencies are installed
3. Run `npx convex dev` to initialize Convex

### Browser Installation

If browser commands fail:

```bash
# Reinstall browser
bunx agent-browser install
```

### Port Already in Use

If port 3000 is already in use:

```bash
# Set a different port
PORT=3001 bun run web
```

## Safety

- Only uses dummy data for forms (`test@example.com`, "Test User")
- Never submits payment forms
- Redacts sensitive data from snapshots before LLM processing
- Timeouts on all browser operations

## License

[Add your license here]
