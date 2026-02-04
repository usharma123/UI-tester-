export type Command = "test" | "validate";

export interface ParsedArgs {
  command: Command;
  url?: string;
  goals?: string;
  specFile?: string;
  outputDir?: string;
  help: boolean;
}

export const DEFAULT_OUTPUT_DIR = "./reports";

export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const args = [...argv];
  const result: ParsedArgs = {
    command: "test",
    help: false,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  if (args[0] === "validate") {
    result.command = "validate";
    args.shift();
  }

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      i++;
      continue;
    }

    if ((arg === "--goals" || arg === "-g") && i + 1 < args.length) {
      result.goals = args[i + 1];
      i += 2;
      continue;
    }

    if ((arg === "--spec" || arg === "-s") && i + 1 < args.length) {
      result.specFile = args[i + 1];
      i += 2;
      continue;
    }

    if ((arg === "--url" || arg === "-u") && i + 1 < args.length) {
      result.url = args[i + 1];
      i += 2;
      continue;
    }

    if ((arg === "--output" || arg === "-o") && i + 1 < args.length) {
      result.outputDir = args[i + 1];
      i += 2;
      continue;
    }

    // Positional argument - URL for test command
    if (!arg.startsWith("-") && !result.url) {
      result.url = arg;
      i++;
      continue;
    }

    i++;
  }

  return result;
}

export function getHelpText(command?: Command): string {
  if (command === "validate") {
    return `
UI QA Agent - Business Logic Validation

Usage:
  ui-qa validate --spec <file> --url <url> [options]

Options:
  --spec, -s <file>     Path to requirements/specification file (required)
  --url, -u <url>       URL to validate against (required)
  --output, -o <dir>    Output directory for reports (default: ./reports)
  --help, -h            Show this help message

Examples:
  ui-qa validate --spec ./requirements.md --url https://app.example.com
  ui-qa validate -s ./prd.md -u https://staging.app.com --output ./reports

Environment Variables:
  OPENROUTER_API_KEY  Required. Your OpenRouter API key.
`;
  }

  return `
UI QA Agent - AI-powered website testing

Usage:
  ui-qa [url] [options]
  ui-qa validate --spec <file> --url <url> [options]

Commands:
  (default)   Run UI/UX testing on a website
  validate    Run business logic validation against a specification

Options:
  --goals, -g <string>  Test goals (default: "homepage UX + primary CTA + form validation + keyboard")
  --help, -h            Show this help message

Examples:
  ui-qa                           # Interactive mode - prompts for URL
  ui-qa https://localhost:3000    # Direct mode - starts testing immediately
  ui-qa https://example.com --goals "test checkout flow"
  ui-qa validate --spec ./requirements.md --url https://app.example.com

Environment Variables:
  OPENROUTER_API_KEY  Required. Your OpenRouter API key.

How it works:
  1. Discovers pages on the target site
  2. AI analyzes each page and generates test scenarios
  3. An AI agent executes each scenario step by step
  4. Generates a comprehensive QA report with pass/fail per scenario

Setup:
  1. Create a .env file in your project directory
  2. Add: OPENROUTER_API_KEY=sk-or-v1-...
  3. Run: ui-qa
`;
}

export function getValidationError(parsed: ParsedArgs): string | null {
  if (parsed.command !== "validate") {
    return null;
  }

  if (!parsed.specFile) {
    return "Error: --spec <file> is required for validate command";
  }

  if (!parsed.url) {
    return "Error: --url <url> is required for validate command";
  }

  return null;
}
