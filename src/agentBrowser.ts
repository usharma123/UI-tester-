import { execa, type ExecaError } from "execa";

export interface AgentBrowserOptions {
  timeout?: number;
  navigationTimeout?: number;
  actionTimeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  debug?: boolean;
}

// Helper to sleep for a given duration
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (timeout, network, or navigation errors)
 */
export function isRetryableError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("net::") ||
    msg.includes("navigation") ||
    msg.includes("target closed") ||
    msg.includes("connection refused") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused")
  );
}

export interface LinkInfo {
  href: string;
  text: string;
}

export interface AgentBrowser {
  open(url: string): Promise<void>;
  snapshot(): Promise<string>;
  click(refOrSelector: string): Promise<void>;
  fill(refOrSelector: string, text: string): Promise<void>;
  press(key: string): Promise<void>;
  getText(refOrSelector: string): Promise<string>;
  screenshot(path: string): Promise<void>;
  getLinks(): Promise<LinkInfo[]>;
  close(): Promise<void>;
}

const DEFAULT_TIMEOUT = 30000;

async function runCommand(
  args: string[],
  options: AgentBrowserOptions = {}
): Promise<string> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  try {
    const result = await execa("bunx", ["agent-browser", ...args], {
      timeout,
      reject: true,
    });

    if (options.debug) {
      console.log(`[agent-browser] ${args.join(" ")}`);
      if (result.stderr) {
        console.error(`[agent-browser stderr] ${result.stderr}`);
      }
    }

    return result.stdout;
  } catch (error) {
    const execaError = error as ExecaError;
    const errorMessage = execaError.stderr || execaError.message || "Unknown error";
    throw new Error(`agent-browser command failed: ${args.join(" ")}\n${errorMessage}`);
  }
}

/**
 * Run a command with retry logic and exponential backoff
 * Retries on timeout, network, and navigation errors
 */
async function runCommandWithRetry(
  args: string[],
  options: AgentBrowserOptions = {},
  maxRetries?: number,
  initialDelayMs?: number
): Promise<string> {
  const retries = maxRetries ?? options.maxRetries ?? 3;
  const delayMs = initialDelayMs ?? options.retryDelayMs ?? 1000;

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await runCommand(args, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on retryable errors and if we have retries left
      if (isRetryableError(lastError) && attempt < retries) {
        const delay = delayMs * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
        if (options.debug) {
          console.log(`[agent-browser] Retry ${attempt + 1}/${retries} after ${delay}ms: ${lastError.message}`);
        }
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError;
}

/**
 * Convert our selector format to Playwright-compatible selector
 * Supports: text:Button, a:Link, button:Submit, role=..., CSS selectors
 */
function normalizeSelector(selector: string): string {
  // Skip @e refs - they're not supported
  if (selector.startsWith("@e")) {
    throw new Error(`Element refs like "${selector}" are not supported. Use text or CSS selectors instead.`);
  }
  
  // text:Button Text -> text=Button Text
  if (selector.startsWith("text:")) {
    return `text=${selector.slice(5)}`;
  }
  
  // a:Link Text -> a:has-text("Link Text")
  if (selector.startsWith("a:")) {
    const linkText = selector.slice(2);
    return `a:has-text("${linkText}")`;
  }
  
  // button:Submit -> button:has-text("Submit")
  if (selector.startsWith("button:")) {
    const buttonText = selector.slice(7);
    return `button:has-text("${buttonText}")`;
  }
  
  // label:Email -> text=Email (will find the label, then we can interact with associated input)
  if (selector.startsWith("label:")) {
    return `text=${selector.slice(6)}`;
  }
  
  // role=button[name="..."] - pass through as-is (Playwright format)
  if (selector.startsWith("role=")) {
    return selector;
  }
  
  // Regular CSS selector - pass through
  return selector;
}

export function createAgentBrowser(options: AgentBrowserOptions = {}): AgentBrowser {
  // Create separate option sets for different operation types
  const navigationOptions: AgentBrowserOptions = {
    ...options,
    timeout: options.navigationTimeout ?? options.timeout,
  };

  const actionOptions: AgentBrowserOptions = {
    ...options,
    timeout: options.actionTimeout ?? options.timeout,
  };

  return {
    async open(url: string): Promise<void> {
      // Use retry wrapper for navigation - most likely to have transient failures
      await runCommandWithRetry(["open", url], navigationOptions);
    },

    async snapshot(): Promise<string> {
      // Snapshots can fail on slow pages, use retry
      return runCommandWithRetry(["snapshot"], options);
    },

    async click(selector: string): Promise<void> {
      const normalizedSelector = normalizeSelector(selector);
      // Actions can sometimes fail transiently, use limited retry
      await runCommandWithRetry(["click", normalizedSelector], actionOptions, 1);
    },

    async fill(selector: string, text: string): Promise<void> {
      const normalizedSelector = normalizeSelector(selector);
      await runCommandWithRetry(["fill", normalizedSelector, text], actionOptions, 1);
    },

    async press(key: string): Promise<void> {
      await runCommand(["press", key], actionOptions);
    },

    async getText(selector: string): Promise<string> {
      const normalizedSelector = normalizeSelector(selector);
      return runCommand(["getText", normalizedSelector], actionOptions);
    },

    async screenshot(path: string): Promise<void> {
      // Screenshots can fail transiently, use retry
      await runCommandWithRetry(["screenshot", path], options, 2);
    },

    async getLinks(): Promise<LinkInfo[]> {
      // Execute JavaScript to extract all links from the page
      // Use single-line script to avoid issues with shell escaping
      const script = `JSON.stringify(Array.from(document.querySelectorAll('a[href]')).map(a=>({href:a.href,text:(a.textContent||'').trim().slice(0,100)})))`;
      try {
        const result = await runCommandWithRetry(["eval", script], options, 1);
        // Parse the JSON result - may need to parse twice if double-encoded
        let parsed = JSON.parse(result);
        if (typeof parsed === "string") {
          parsed = JSON.parse(parsed);
        }
        return parsed as LinkInfo[];
      } catch (error) {
        // If eval command fails, return empty array
        if (options.debug) {
          console.log(`[agent-browser] getLinks failed: ${error}`);
        }
        return [];
      }
    },

    async close(): Promise<void> {
      await runCommand(["close"], options);
    },
  };
}

export type { AgentBrowserOptions as BrowserOptions };
