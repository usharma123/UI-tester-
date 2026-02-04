export interface Config {
  openRouterApiKey: string;
  openRouterModel: string;
  maxPages: number;
  maxScenariosPerPage: number;
  maxStepsPerScenario: number;
  parallelBrowsers: number;
  browserTimeout: number;
  navigationTimeout: number;
  actionTimeout: number;
  maxRetries: number;
  retryDelayMs: number;
  goals: string;
  headless: boolean;
  screenshotDir: string;
  reportDir: string;
}

export interface CLIOptions {
  goals?: string;
  model?: string;
}

const DEFAULT_CONFIG = {
  openRouterModel: "anthropic/claude-sonnet-4.5",
  maxPages: 20,
  maxScenariosPerPage: 5,
  maxStepsPerScenario: 10,
  parallelBrowsers: 3,
  browserTimeout: 60000,
  navigationTimeout: 45000,
  actionTimeout: 15000,
  maxRetries: 3,
  retryDelayMs: 1000,
  goals: "homepage UX + primary CTA + form validation + keyboard",
  headless: true,
  screenshotDir: "screenshots",
  reportDir: "reports",
};

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
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
    maxPages: parseInt(process.env.MAX_PAGES ?? String(DEFAULT_CONFIG.maxPages), 10),
    maxScenariosPerPage: parseInt(process.env.MAX_SCENARIOS_PER_PAGE ?? String(DEFAULT_CONFIG.maxScenariosPerPage), 10),
    maxStepsPerScenario: parseInt(process.env.MAX_STEPS_PER_SCENARIO ?? String(DEFAULT_CONFIG.maxStepsPerScenario), 10),
    parallelBrowsers: Math.min(10, Math.max(1, parseInt(process.env.PARALLEL_BROWSERS ?? String(DEFAULT_CONFIG.parallelBrowsers), 10))),
    browserTimeout: parseInt(process.env.BROWSER_TIMEOUT ?? String(DEFAULT_CONFIG.browserTimeout), 10),
    navigationTimeout: parseInt(process.env.NAVIGATION_TIMEOUT ?? String(DEFAULT_CONFIG.navigationTimeout), 10),
    actionTimeout: parseInt(process.env.ACTION_TIMEOUT ?? String(DEFAULT_CONFIG.actionTimeout), 10),
    maxRetries: parseInt(process.env.MAX_RETRIES ?? String(DEFAULT_CONFIG.maxRetries), 10),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS ?? String(DEFAULT_CONFIG.retryDelayMs), 10),
    goals: cliOptions.goals ?? process.env.GOALS ?? DEFAULT_CONFIG.goals,
    headless: parseBoolean(process.env.HEADLESS, DEFAULT_CONFIG.headless),
    screenshotDir: process.env.SCREENSHOT_DIR ?? DEFAULT_CONFIG.screenshotDir,
    reportDir: process.env.REPORT_DIR ?? DEFAULT_CONFIG.reportDir,
  };
}
