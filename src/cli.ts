#!/usr/bin/env node
import { loadConfig, type CLIOptions } from "./config.js";
import { runQA, printReportSummary } from "./qa/run.js";

function printUsage(): void {
  console.log(`
UI/UX QA Agent - AI-powered website testing

Usage:
  pnpm qa <url> [options]

Options:
  --goals <string>     Test goals (default: "homepage UX + primary CTA + form validation + keyboard")
  --maxSteps <number>  Maximum steps to execute (default: 20)
  --model <string>     OpenRouter model to use (default: from env or google/gemini-3-flash)
  --help               Show this help message

Environment Variables:
  OPENROUTER_API_KEY   Required. Your OpenRouter API key.
  OPENROUTER_MODEL     Default model to use.
  MAX_STEPS            Default maximum steps.
  GOALS                Default test goals.
  SCREENSHOT_DIR       Directory for screenshots (default: screenshots/)
  REPORT_DIR           Directory for reports (default: reports/)
  BROWSER_TIMEOUT      Browser command timeout in ms (default: 30000)
  DEBUG                Set to "true" for verbose output.

Examples:
  pnpm qa https://example.com
  pnpm qa https://example.com --goals "test login flow + form validation"
  pnpm qa https://example.com --maxSteps 10 --model "anthropic/claude-sonnet-4"
`);
}

function parseArgs(args: string[]): { url: string | null; options: CLIOptions; help: boolean } {
  const result: { url: string | null; options: CLIOptions; help: boolean } = {
    url: null,
    options: {},
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      i++;
      continue;
    }

    if (arg === "--goals" && i + 1 < args.length) {
      result.options.goals = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === "--maxSteps" && i + 1 < args.length) {
      result.options.maxSteps = parseInt(args[i + 1], 10);
      i += 2;
      continue;
    }

    if (arg === "--model" && i + 1 < args.length) {
      result.options.model = args[i + 1];
      i += 2;
      continue;
    }

    if (!arg.startsWith("--") && !result.url) {
      result.url = arg;
      i++;
      continue;
    }

    i++;
  }

  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { url, options, help } = parseArgs(args);

  if (help) {
    printUsage();
    process.exit(0);
  }

  if (!url) {
    console.error("Error: URL is required\n");
    printUsage();
    process.exit(1);
  }

  try {
    new URL(url);
  } catch {
    console.error(`Error: Invalid URL: ${url}\n`);
    process.exit(1);
  }

  try {
    const config = loadConfig(options);
    const result = await runQA(config, url);
    printReportSummary(result);

    if (result.report.score < 50) {
      process.exit(1);
    }
  } catch (error) {
    console.error("\nError:", error instanceof Error ? error.message : String(error));

    if (process.env.DEBUG === "true" && error instanceof Error) {
      console.error("\nStack trace:", error.stack);
    }

    process.exit(1);
  }
}

main();
