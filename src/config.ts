export interface Config {
  openRouterApiKey: string;
  openRouterModel: string;
  maxSteps: number;
  goals: string;
  screenshotDir: string;
  reportDir: string;
  browserTimeout: number;
  navigationTimeout: number;
  actionTimeout: number;
  maxRetries: number;
  retryDelayMs: number;
  maxPages: number;
  stepsPerPage: number;
  parallelBrowsers: number;  // Number of concurrent browser instances for parallel testing
  auditsEnabled: boolean;
  strictMode: boolean;
  captureBeforeAfterScreenshots: boolean;
  viewports: ViewportConfig[];
}

export interface CLIOptions {
  goals?: string;
  maxSteps?: number;
  model?: string;
}

export interface ViewportConfig {
  label: string;
  width: number;
  height: number;
}

const DEFAULT_CONFIG = {
  openRouterModel: "anthropic/claude-sonnet-4.5",
  maxSteps: 20,
  goals: "homepage UX + primary CTA + form validation + keyboard",
  screenshotDir: "screenshots",
  reportDir: "reports",
  browserTimeout: 60000,        // Increased from 30s to 60s
  navigationTimeout: 45000,     // Separate timeout for page loads
  actionTimeout: 15000,         // Timeout for clicks/fills
  maxRetries: 3,                // Retry 3 times before skipping
  retryDelayMs: 1000,           // Initial retry delay (doubles each retry)
  maxPages: 50,                 // Maximum pages to test from sitemap
  stepsPerPage: 5,              // Max steps per page in per-page testing mode
  parallelBrowsers: 5,          // Number of concurrent browser instances (1-10)
  auditsEnabled: true,
  strictMode: false,
  captureBeforeAfterScreenshots: true,
  viewports: [
    { label: "desktop", width: 1365, height: 768 },
    { label: "tablet", width: 820, height: 1180 },
    { label: "mobile", width: 390, height: 844 },
  ],
};

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseViewports(value: string | undefined, defaults: ViewportConfig[]): ViewportConfig[] {
  if (!value) return defaults;
  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [labelPart, sizePart] = entry.includes(":") ? entry.split(":") : ["", entry];
      const match = sizePart.match(/(\\d+)x(\\d+)/i);
      if (!match) return null;
      const width = parseInt(match[1], 10);
      const height = parseInt(match[2], 10);
      if (!width || !height) return null;
      const label = labelPart.trim() || `${width}x${height}`;
      return { label, width, height };
    })
    .filter((entry): entry is ViewportConfig => Boolean(entry));

  return parsed.length > 0 ? parsed : defaults;
}

export function loadConfig(cliOptions: CLIOptions = {}): Config {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY environment variable is required. " +
      "Please set it in your .env file or environment."
    );
  }

  return {
    openRouterApiKey: apiKey,
    openRouterModel: cliOptions.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_CONFIG.openRouterModel,
    maxSteps: cliOptions.maxSteps ?? parseInt(process.env.MAX_STEPS ?? String(DEFAULT_CONFIG.maxSteps), 10),
    goals: cliOptions.goals ?? process.env.GOALS ?? DEFAULT_CONFIG.goals,
    screenshotDir: process.env.SCREENSHOT_DIR ?? DEFAULT_CONFIG.screenshotDir,
    reportDir: process.env.REPORT_DIR ?? DEFAULT_CONFIG.reportDir,
    browserTimeout: parseInt(process.env.BROWSER_TIMEOUT ?? String(DEFAULT_CONFIG.browserTimeout), 10),
    navigationTimeout: parseInt(process.env.NAVIGATION_TIMEOUT ?? String(DEFAULT_CONFIG.navigationTimeout), 10),
    actionTimeout: parseInt(process.env.ACTION_TIMEOUT ?? String(DEFAULT_CONFIG.actionTimeout), 10),
    maxRetries: parseInt(process.env.MAX_RETRIES ?? String(DEFAULT_CONFIG.maxRetries), 10),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS ?? String(DEFAULT_CONFIG.retryDelayMs), 10),
    maxPages: parseInt(process.env.MAX_PAGES ?? String(DEFAULT_CONFIG.maxPages), 10),
    stepsPerPage: parseInt(process.env.STEPS_PER_PAGE ?? String(DEFAULT_CONFIG.stepsPerPage), 10),
    parallelBrowsers: Math.min(10, Math.max(1, parseInt(process.env.PARALLEL_BROWSERS ?? String(DEFAULT_CONFIG.parallelBrowsers), 10))),
    auditsEnabled: parseBoolean(process.env.AUDITS_ENABLED, DEFAULT_CONFIG.auditsEnabled),
    strictMode: parseBoolean(process.env.STRICT_MODE, DEFAULT_CONFIG.strictMode),
    captureBeforeAfterScreenshots: parseBoolean(process.env.CAPTURE_BEFORE_AFTER, DEFAULT_CONFIG.captureBeforeAfterScreenshots),
    viewports: parseViewports(process.env.VIEWPORTS, DEFAULT_CONFIG.viewports),
  };
}
