import { execa, type ExecaError } from "execa";

export interface AgentBrowserOptions {
  timeout?: number;
  debug?: boolean;
}

export interface AgentBrowser {
  open(url: string): Promise<void>;
  snapshot(): Promise<string>;
  click(refOrSelector: string): Promise<void>;
  fill(refOrSelector: string, text: string): Promise<void>;
  press(key: string): Promise<void>;
  getText(refOrSelector: string): Promise<string>;
  screenshot(path: string): Promise<void>;
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
  return {
    async open(url: string): Promise<void> {
      await runCommand(["open", url], options);
    },

    async snapshot(): Promise<string> {
      return runCommand(["snapshot"], options);
    },

    async click(selector: string): Promise<void> {
      const normalizedSelector = normalizeSelector(selector);
      await runCommand(["click", normalizedSelector], options);
    },

    async fill(selector: string, text: string): Promise<void> {
      const normalizedSelector = normalizeSelector(selector);
      await runCommand(["fill", normalizedSelector, text], options);
    },

    async press(key: string): Promise<void> {
      await runCommand(["press", key], options);
    },

    async getText(selector: string): Promise<string> {
      const normalizedSelector = normalizeSelector(selector);
      return runCommand(["getText", normalizedSelector], options);
    },

    async screenshot(path: string): Promise<void> {
      await runCommand(["screenshot", path], options);
    },

    async close(): Promise<void> {
      await runCommand(["close"], options);
    },
  };
}

export type { AgentBrowserOptions as BrowserOptions };
