# Advanced Features

This page covers deeper behaviors and tuning knobs for test and validation runs.

## Discovery Strategy

UI QA uses a multi-tier discovery approach:

1. **Sitemap Discovery**: First checks for `sitemap.xml` at the root URL
2. **Robots.txt**: Parses `robots.txt` for sitemap references
3. **Link Crawling**: Falls back to recursive link crawling using a real browser if sitemap discovery finds too few pages
4. **Single URL Fallback**: If all discovery methods fail, tests the starting URL only

**Tuning:**
- `MAX_PAGES` limits how many discovered URLs are tested (default: 20 for test mode, 50 for validation mode)

## Scenario Generation

For each discovered page, the LLM analyzes:
- DOM structure snapshot (with sensitive data redacted)
- Screenshot of the page
- User-specified goals (via `--goals` or `GOALS` env var)

Based on this analysis, it generates focused test scenarios that are then executed by the browser agent.

**Tuning:**
- `MAX_SCENARIOS_PER_PAGE` caps how many scenarios are generated per page (default: 5)
- `MAX_STEPS_PER_SCENARIO` caps how long each scenario can run (default: 10)
- `GOALS` steers the kinds of scenarios the LLM generates (default: "homepage UX + primary CTA + form validation + keyboard")

## Parallel Execution

Scenarios run concurrently across multiple browser instances to significantly speed up execution. Each browser instance operates independently, allowing multiple pages to be tested simultaneously.

**Tuning:**
- `PARALLEL_BROWSERS` controls concurrency (default: 3 for test mode, 5 for validation mode, clamped to 1-10)

## Stability, Retries, and Timeouts

The agent includes several stability mechanisms:

- **DOM Stabilization**: After navigations and actions, waits for the DOM to stabilize before proceeding
- **Retry Logic**: Automatically retries transient failures (timeouts, navigation errors, network errors) with exponential backoff
- **Timeout Protection**: All browser operations have configurable timeouts to prevent hanging

**Tuning:**
- `BROWSER_TIMEOUT`: General browser timeout (default: 60000ms)
- `NAVIGATION_TIMEOUT`: Page load timeout (default: 45000ms)
- `ACTION_TIMEOUT`: Click/fill action timeout (default: 15000ms)
- `SCENARIO_TIMEOUT_MS`: Per-scenario timeout in validation mode (default: `max(BROWSER_TIMEOUT * 4, 180000)`)
- `LLM_TIMEOUT_MS`: Default timeout for LLM calls (default: 60000ms)
- `CROSS_VALIDATION_TIMEOUT_MS`: Cross-validation request timeout override (falls back to `LLM_TIMEOUT_MS`, then 90000ms)
- `MAX_RETRIES`: Retry attempts for transient failures (default: 3, test mode only)
- `RETRY_DELAY_MS`: Initial retry delay, doubles each attempt (default: 1000ms, test mode only)

## Custom Dropdown Select Fallback

The `select` action supports both native `<select>` elements and many custom dropdown patterns:

- Native `<select>`: Uses `selectOption` with value/label matching
- Custom components: Falls back to combobox/listbox selectors (`[role='combobox']`, `[aria-haspopup='listbox']`, listbox options)
- `:nth-of-type(...)` selectors: Preserves positional targeting when falling back

This improves reliability on modern UI libraries that render non-native selects.

## Debugging and Headed Mode

**Debugging:** Set `DEBUG=true` to enable verbose logging and browser debug output. This includes:
- Detailed step-by-step execution logs
- Browser console output
- Network request details
- Error stack traces

**Headed Mode:** Set `HEADLESS=false` to watch test mode runs in a visible browser window. This is useful for:
- Debugging test execution issues
- Understanding what the agent sees
- Verifying test behavior

Note: Validation mode currently runs headless only.

## Structured Event Logs and Heartbeats

By default, UI QA writes streaming JSON events to `.ui-qa-runs/<run-id>/events.jsonl`.

- Disable with `JSON_LOGS=false`
- Force-enable from CLI with `--json-logs`
- Includes periodic heartbeat messages during long phases (for example, execution and cross-validation progress updates every ~15 seconds)

## Screenshot Capture

Screenshots are automatically captured at key moments:
- Initial page load
- After each test step
- On errors or failures
- Before and after form submissions

All screenshots are saved to `.ui-qa-runs/<run-id>/screenshots/` and referenced in the reports.

## Report Generation

Reports include:
- **Quality Score**: 0-100 overall score
- **Categorized Issues**: Grouped by severity (blocker, high, medium, low, nit) and category (Navigation, Forms, Accessibility, Visual, Feedback, Content)
- **Reproduction Steps**: Detailed steps to reproduce each issue
- **Suggested Fixes**: LLM-generated recommendations for fixing issues
- **Evidence**: Screenshots and execution logs linked to each issue

Reports are generated in multiple formats:
- `report.md`: Human-readable markdown report
- `llm-fix.txt`: Plain-text fix guide optimized for LLM consumption
- `run.json`: Complete structured data with embedded report and evidence
