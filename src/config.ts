export interface Config {
  openRouterApiKey: string;
  openRouterModel: string;
  maxSteps: number;
  goals: string;
  screenshotDir: string;
  reportDir: string;
  browserTimeout: number;
}

export interface CLIOptions {
  goals?: string;
  maxSteps?: number;
  model?: string;
}

const DEFAULT_CONFIG = {
  openRouterModel: "minimax/minimax-m1",
  maxSteps: 20,
  goals: "homepage UX + primary CTA + form validation + keyboard",
  screenshotDir: "screenshots",
  reportDir: "reports",
  browserTimeout: 30000,
};

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
  };
}
