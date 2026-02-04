# Advanced Features

This page covers deeper behaviors and tuning knobs for test and validation runs.

## Discovery Strategy

UI QA starts with static discovery (sitemap.xml and robots.txt). If it finds too few pages, it falls back to link crawling using a real browser. When discovery fails, it tests the starting URL only.

**Tuning:**
- `MAX_PAGES` limits how many discovered URLs are tested.

## Scenario Generation

For each discovered page, the LLM analyzes a DOM snapshot plus a screenshot and generates test scenarios. Each scenario is then executed by the agent.

**Tuning:**
- `MAX_SCENARIOS_PER_PAGE` caps how many scenarios are generated per page.
- `MAX_STEPS_PER_SCENARIO` caps how long each scenario can run.
- `GOALS` steers the kinds of scenarios the LLM generates.

## Parallel Execution

Scenarios run in batches across multiple browser instances to speed up execution.

**Tuning:**
- `PARALLEL_BROWSERS` controls concurrency (clamped to 1-10 in test mode).

## Stability, Retries, and Timeouts

After navigations and actions, the agent waits for the DOM to stabilize before proceeding. Retry logic is applied to transient failures (timeouts, navigation errors, network errors).

**Tuning:**
- `BROWSER_TIMEOUT`, `NAVIGATION_TIMEOUT`, `ACTION_TIMEOUT`
- `MAX_RETRIES`, `RETRY_DELAY_MS`

## Debugging and Headed Mode

**Debugging:** set `DEBUG=true` to enable verbose logging and browser debug output.

**Headed Mode:** set `HEADLESS=false` to watch test mode runs in a visible browser window. Validation mode currently runs headless only.
