#!/usr/bin/env node
import "dotenv/config";
import { render } from "ink";
import React from "react";
import { App } from "./ink/App.js";

// Parse command line arguments
function parseArgs(): { url?: string; goals?: string; help: boolean } {
  const args = process.argv.slice(2);
  const result: { url?: string; goals?: string; help: boolean } = { help: false };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      i++;
      continue;
    }

    if (arg === "--goals" && i + 1 < args.length) {
      result.goals = args[i + 1];
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

function printHelp(): void {
  console.log(`
UI QA Agent - AI-powered website testing

Usage:
  ui-qa [url] [options]

Options:
  --goals <string>  Test goals (default: "homepage UX + primary CTA + form validation + keyboard")
  --help, -h        Show this help message

Examples:
  ui-qa                           # Interactive mode - prompts for URL
  ui-qa https://localhost:3000    # Direct mode - starts testing immediately
  ui-qa https://example.com --goals "test checkout flow"

Environment Variables:
  OPENROUTER_API_KEY  Required. Your OpenRouter API key.

Setup:
  1. Create a .env file in your project directory
  2. Add: OPENROUTER_API_KEY=sk-or-v1-...
  3. Run: ui-qa
`);
}

const { url, goals, help } = parseArgs();

if (help) {
  printHelp();
  process.exit(0);
}

// Render the Ink app
render(<App initialUrl={url} initialGoals={goals} />);
