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
  
  // ============================================================================
  // Coverage-Guided Exploration Config
  // ============================================================================
  
  /** Budget configuration for exploration limits */
  budgetConfig: BudgetConfig;
  /** Exploration mode: coverage_guided, breadth_first, depth_first, random */
  explorationMode: ExplorationMode;
  /** Beam width for beam search exploration (default: 3) */
  beamWidth: number;
  /** Whether to enable coverage-guided exploration (vs traditional planning) */
  coverageGuidedEnabled: boolean;
  
  // ============================================================================
  // Visual Audit Config
  // ============================================================================
  
  /** Whether to run visual heuristic audits */
  visualAuditsEnabled: boolean;
  /** Directory to store baseline screenshots */
  baselineDir: string;
  /** Diff threshold for visual regression (0-100, default: 5) */
  diffThreshold: number;
  
  // ============================================================================
  // Auth Fixture Config
  // ============================================================================
  
  /** Directory to store auth fixtures */
  authFixtureDir: string;
  /** Auth fixture to use for this run (ID or name) */
  authFixture?: string;

  // ============================================================================
  // LLM Navigator Config
  // ============================================================================

  /** Configuration for LLM-guided exploration */
  llmNavigatorConfig: LLMNavigatorConfig;
}

// ============================================================================
// LLM Navigator Config Type
// ============================================================================

export interface LLMNavigatorConfig {
  /** Whether LLM navigation is enabled */
  enabled: boolean;
  /** Model to use for navigation decisions */
  model: string;
  /** Temperature for LLM responses (0-1, lower = more deterministic) */
  temperature: number;
  /** Maximum LLM calls per exploration step */
  maxLLMCallsPerStep: number;
  /** Whether to use smart interactions for search/forms */
  smartInteractions: boolean;
}

// ============================================================================
// Budget Config Type
// ============================================================================

export interface BudgetConfig {
  /** Maximum steps allowed per unique page state (default: 10) */
  maxStepsPerPageState: number;
  /** Maximum unique states to visit (default: 100) */
  maxUniqueStates: number;
  /** Maximum total steps across all states (default: 500) */
  maxTotalSteps: number;
  /** Number of steps without coverage gain before stopping (default: 15) */
  stagnationThreshold: number;
  /** Maximum depth in the exploration tree (default: 10) */
  maxDepth: number;
  /** Time limit in milliseconds (default: 600000 = 10 minutes) */
  maxTimeMs: number;
}

export type ExplorationMode = "coverage_guided" | "breadth_first" | "depth_first" | "random" | "llm_guided";

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

const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  maxStepsPerPageState: 10,
  maxUniqueStates: 100,
  maxTotalSteps: 500,
  stagnationThreshold: 15,
  maxDepth: 10,
  maxTimeMs: 600000, // 10 minutes
};

const DEFAULT_LLM_NAVIGATOR_CONFIG: LLMNavigatorConfig = {
  enabled: false,
  model: "anthropic/claude-sonnet-4-20250514",
  temperature: 0.3,
  maxLLMCallsPerStep: 2,
  smartInteractions: true,
};

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
  // Coverage-guided exploration defaults
  budgetConfig: DEFAULT_BUDGET_CONFIG,
  explorationMode: "coverage_guided" as ExplorationMode,
  beamWidth: 3,
  coverageGuidedEnabled: true, // Enabled by default for coverage-guided exploration
  // Visual audit defaults
  visualAuditsEnabled: true,
  baselineDir: ".ui-qa/baselines",
  diffThreshold: 5,
  // Auth fixture defaults
  authFixtureDir: ".ui-qa/auth-fixtures",
  // LLM navigator defaults
  llmNavigatorConfig: DEFAULT_LLM_NAVIGATOR_CONFIG,
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

function parseExplorationMode(value: string | undefined, defaultValue: ExplorationMode): ExplorationMode {
  if (!value) return defaultValue;
  const valid: ExplorationMode[] = ["coverage_guided", "breadth_first", "depth_first", "random", "llm_guided"];
  const normalized = value.toLowerCase().replace(/-/g, "_") as ExplorationMode;
  return valid.includes(normalized) ? normalized : defaultValue;
}

function parseLLMNavigatorConfig(env: NodeJS.ProcessEnv): LLMNavigatorConfig {
  const explorationMode = parseExplorationMode(env.EXPLORATION_MODE, "coverage_guided");
  return {
    enabled: explorationMode === "llm_guided" || parseBoolean(env.LLM_NAVIGATOR_ENABLED, DEFAULT_LLM_NAVIGATOR_CONFIG.enabled),
    model: env.LLM_NAVIGATOR_MODEL ?? DEFAULT_LLM_NAVIGATOR_CONFIG.model,
    temperature: parseFloat(env.LLM_NAVIGATOR_TEMPERATURE ?? String(DEFAULT_LLM_NAVIGATOR_CONFIG.temperature)),
    maxLLMCallsPerStep: parseInt(env.LLM_MAX_CALLS_PER_STEP ?? String(DEFAULT_LLM_NAVIGATOR_CONFIG.maxLLMCallsPerStep), 10),
    smartInteractions: parseBoolean(env.LLM_SMART_INTERACTIONS, DEFAULT_LLM_NAVIGATOR_CONFIG.smartInteractions),
  };
}

function parseBudgetConfig(env: NodeJS.ProcessEnv): BudgetConfig {
  return {
    maxStepsPerPageState: parseInt(env.BUDGET_MAX_STEPS_PER_STATE ?? String(DEFAULT_BUDGET_CONFIG.maxStepsPerPageState), 10),
    maxUniqueStates: parseInt(env.BUDGET_MAX_UNIQUE_STATES ?? String(DEFAULT_BUDGET_CONFIG.maxUniqueStates), 10),
    maxTotalSteps: parseInt(env.BUDGET_MAX_TOTAL_STEPS ?? String(DEFAULT_BUDGET_CONFIG.maxTotalSteps), 10),
    stagnationThreshold: parseInt(env.BUDGET_STAGNATION_THRESHOLD ?? String(DEFAULT_BUDGET_CONFIG.stagnationThreshold), 10),
    maxDepth: parseInt(env.BUDGET_MAX_DEPTH ?? String(DEFAULT_BUDGET_CONFIG.maxDepth), 10),
    maxTimeMs: parseInt(env.BUDGET_MAX_TIME_MS ?? String(DEFAULT_BUDGET_CONFIG.maxTimeMs), 10),
  };
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
    
    // Coverage-guided exploration config
    budgetConfig: parseBudgetConfig(process.env),
    explorationMode: parseExplorationMode(process.env.EXPLORATION_MODE, DEFAULT_CONFIG.explorationMode),
    beamWidth: parseInt(process.env.BEAM_WIDTH ?? String(DEFAULT_CONFIG.beamWidth), 10),
    coverageGuidedEnabled: parseBoolean(process.env.COVERAGE_GUIDED, DEFAULT_CONFIG.coverageGuidedEnabled),
    
    // Visual audit config
    visualAuditsEnabled: parseBoolean(process.env.VISUAL_AUDITS, DEFAULT_CONFIG.visualAuditsEnabled),
    baselineDir: process.env.BASELINE_DIR ?? DEFAULT_CONFIG.baselineDir,
    diffThreshold: parseInt(process.env.DIFF_THRESHOLD ?? String(DEFAULT_CONFIG.diffThreshold), 10),
    
    // Auth fixture config
    authFixtureDir: process.env.AUTH_FIXTURE_DIR ?? DEFAULT_CONFIG.authFixtureDir,
    authFixture: process.env.AUTH_FIXTURE,

    // LLM navigator config
    llmNavigatorConfig: parseLLMNavigatorConfig(process.env),
  };
}
