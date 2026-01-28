#!/usr/bin/env node
import "dotenv/config";
import { render } from "ink";
import React from "react";
import { App } from "./ink/App.js";
import { ValidateApp } from "./ink/ValidateApp.js";
import { checkForUpdates } from "./updates/index.js";
import type { UpdateInfo } from "./updates/types.js";

// Package version - used for update checking
const PACKAGE_VERSION = "1.0.0";

// Command types
type Command = "test" | "validate";

interface ParsedArgs {
  command: Command;
  url?: string;
  goals?: string;
  specFile?: string;
  outputDir?: string;
  help: boolean;
}

// Parse command line arguments
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const result: ParsedArgs = {
    command: "test",
    help: false,
    outputDir: "./reports",
  };

  // Check for validate subcommand
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

function printHelp(command?: Command): void {
  if (command === "validate") {
    console.log(`
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

The validation process:
  1. Parses your specification document
  2. Extracts testable requirements using AI
  3. Generates a rubric with pass/fail conditions
  4. Discovers the site structure
  5. Creates a requirement-linked test plan
  6. Executes tests with browser automation
  7. Cross-validates results against requirements
  8. Generates a traceability report

Environment Variables:
  OPENROUTER_API_KEY  Required. Your OpenRouter API key.
`);
  } else {
    console.log(`
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

Setup:
  1. Create a .env file in your project directory
  2. Add: OPENROUTER_API_KEY=sk-or-v1-...
  3. Run: ui-qa
`);
  }
}

const parsed = parseArgs();

if (parsed.help) {
  printHelp(parsed.command);
  process.exit(0);
}

// Validate required args for validate command
if (parsed.command === "validate") {
  if (!parsed.specFile) {
    console.error("Error: --spec <file> is required for validate command");
    console.error("Run 'ui-qa validate --help' for usage");
    process.exit(1);
  }
  if (!parsed.url) {
    console.error("Error: --url <url> is required for validate command");
    console.error("Run 'ui-qa validate --help' for usage");
    process.exit(1);
  }
}

// Non-blocking update check - don't await, let it run in background
let updateInfo: UpdateInfo | null = null;

async function main() {
  // Start update check (non-blocking, fire and forget with callback)
  const updatePromise = checkForUpdates(PACKAGE_VERSION).then((result) => {
    updateInfo = result.updateInfo;
  });

  // Give update check a small head start, but don't wait long
  await Promise.race([
    updatePromise,
    new Promise((resolve) => setTimeout(resolve, 100)),
  ]);

  // Render the appropriate app based on command
  if (parsed.command === "validate") {
    render(
      <ValidateApp
        specFile={parsed.specFile!}
        url={parsed.url!}
        outputDir={parsed.outputDir!}
      />
    );
  } else {
    render(
      <App
        initialUrl={parsed.url}
        initialGoals={parsed.goals}
        updateInfo={updateInfo}
      />
    );
  }
}

main();
