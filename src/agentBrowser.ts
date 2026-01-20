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

export function createAgentBrowser(options: AgentBrowserOptions = {}): AgentBrowser {
  return {
    async open(url: string): Promise<void> {
      await runCommand(["open", url], options);
    },

    async snapshot(): Promise<string> {
      return runCommand(["snapshot"], options);
    },

    async click(refOrSelector: string): Promise<void> {
      await runCommand(["click", refOrSelector], options);
    },

    async fill(refOrSelector: string, text: string): Promise<void> {
      await runCommand(["fill", refOrSelector, text], options);
    },

    async press(key: string): Promise<void> {
      await runCommand(["press", key], options);
    },

    async getText(refOrSelector: string): Promise<string> {
      return runCommand(["getText", refOrSelector], options);
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
