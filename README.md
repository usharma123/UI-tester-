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

- [Node.js](https://nodejs.org/) v18+ runtime
- [pnpm](https://pnpm.io/) package manager
- [OpenRouter](https://openrouter.ai/) API key
- [Convex](https://www.convex.dev/) account (for web interface)

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd ui-qa-agent

# Install dependencies
pnpm install

# Install browser (first time only)
pnpm dlx agent-browser install

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

### Frontend Setup

```bash
# Install frontend dependencies
cd frontend
pnpm install

# Build for production (outputs to /dist)
pnpm build

# Or run development server (with hot reload)
pnpm dev
```

## Development

For local development with hot reloading:

```bash
# Terminal 1: Start Convex dev server
npx convex dev

# Terminal 2: Start frontend dev server (port 5173)
cd frontend && pnpm dev

# Terminal 3: Start backend server (port 3000)
pnpm dev
```

The frontend dev server proxies `/api` requests to the backend server.

## Usage

### CLI Usage

```bash
# Basic usage
pnpm qa https://example.com

# With custom goals
pnpm qa https://example.com --goals "test login flow + form validation"

# With step limit
pnpm qa https://example.com --maxSteps 10

# With specific model
pnpm qa https://example.com --model "anthropic/claude-3-haiku"

# Show help
pnpm qa --help
```

### Web Interface

```bash
# Start the web server
pnpm web

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
├── src/                    # Backend source code
│   ├── cli.ts              # CLI entry point
│   ├── config.ts           # Configuration management
│   ├── agentBrowser.ts     # Browser automation wrapper
│   ├── qa/                 # QA core logic
│   │   ├── planner.ts      # Test plan generation
│   │   ├── executor.ts     # Test execution
│   │   ├── judge.ts        # Result evaluation
│   │   ├── run.ts          # CLI run orchestrator
│   │   └── run-streaming.ts # Web streaming run orchestrator
│   ├── web/                # Web server
│   │   ├── server.ts       # Express HTTP server with SSE
│   │   ├── convex.ts       # Convex HTTP API client
│   │   └── types.ts        # Type definitions
│   └── utils/              # Utility functions
│       ├── browserPool.ts  # Browser instance pooling
│       ├── sitemap.ts      # Sitemap parsing
│       └── ...
├── frontend/               # React frontend (source)
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── store/          # Zustand state management
│   │   └── lib/            # Utilities and types
│   ├── vite.config.ts      # Vite build configuration
│   └── package.json        # Frontend dependencies
├── convex/                 # Convex backend
│   ├── schema.ts           # Database schema
│   ├── runs.ts             # Run management functions
│   ├── users.ts            # User management functions
│   ├── screenshots.ts      # Screenshot management
│   └── auth.config.ts      # WorkOS AuthKit configuration
├── dist/                   # Frontend build output (generated)
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
                    ┌─────────────────────────────────────────────────────┐
                    │                   QA Pipeline                       │
                    │  Planner (LLM) → Executor (Browser) → Judge (LLM)   │
                    └─────────────────────────────────────────────────────┘
                                            ↑
                    ┌───────────────────────┴───────────────────────┐
                    │                                               │
            ┌───────┴───────┐                           ┌───────────┴───────────┐
            │   CLI Mode    │                           │      Web Mode         │
            │  (src/cli.ts) │                           │  (src/web/server.ts)  │
            └───────────────┘                           └───────────┬───────────┘
                                                                    │
                                                        ┌───────────┴───────────┐
                                                        │                       │
                                            ┌───────────┴──────┐    ┌───────────┴───────────┐
                                            │  React Frontend  │    │   Convex Backend      │
                                            │   (frontend/)    │    │   (convex/)           │
                                            │  - Components    │    │   - Database schema   │
                                            │  - Zustand store │    │   - Auth (WorkOS)     │
                                            │  - SSE client    │    │   - Run persistence   │
                                            └──────────────────┘    └───────────────────────┘
```

### Components

1. **Planner**: Analyzes the page DOM and creates intelligent test plans using LLM
2. **Executor**: Runs the plan step-by-step using real browser automation
3. **Judge**: Evaluates test evidence and generates scored reports with issues
4. **Express Server**: Serves the frontend and provides REST API + SSE streaming
5. **Convex Backend**: Stores runs, screenshots, user data with WorkOS authentication
6. **React Frontend**: Modern UI with real-time progress updates via SSE

### Data Flow

1. User submits URL via CLI or Web UI
2. QA pipeline plans and executes tests
3. Progress events streamed via SSE (web) or console (CLI)
4. Results stored in Convex and returned to user
5. Screenshots captured at key moments and stored with run

## Convex Functions

The project includes Convex functions for:

- **Runs Management**: Store and query test runs
- **Screenshots**: Manage screenshot storage and retrieval
- **Schema**: Define data models for runs and screenshots

See `convex/` directory for implementation details.

## Testing

```bash
# Run tests
pnpm test
```

## Troubleshooting

### Convex Import Error

If you see `Could not resolve "convex/server"`:

1. Ensure `convex.config.ts` exists in the `convex/` directory
2. Run `pnpm install` to ensure dependencies are installed
3. Run `npx convex dev` to initialize Convex

### Browser Installation

If browser commands fail:

```bash
# Reinstall browser
pnpm dlx agent-browser install
```

### Port Already in Use

If port 3000 is already in use:

```bash
# Set a different port
PORT=3001 pnpm web
```

## Safety

- Only uses dummy data for forms (`test@example.com`, "Test User")
- Never submits payment forms
- Redacts sensitive data from snapshots before LLM processing
- Timeouts on all browser operations

## License

[Add your license here]
