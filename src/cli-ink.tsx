#!/usr/bin/env node
import "dotenv/config";
import { render } from "ink";
import React from "react";
import { parseArgs, getHelpText, getValidationError } from "./cli/args.js";
import { App } from "./ink/App.js";
import { ValidateApp } from "./ink/ValidateApp.js";
import { checkForUpdates } from "./updates/index.js";
import type { UpdateInfo } from "./updates/types.js";

const PACKAGE_VERSION = "1.0.1";

const parsed = parseArgs();

if (parsed.help) {
  console.log(getHelpText(parsed.command));
  process.exit(0);
}

const validationError = getValidationError(parsed);
if (validationError) {
  console.error(validationError);
  console.error("Run 'ui-qa validate --help' for usage");
  process.exit(1);
}

let updateInfo: UpdateInfo | null = null;

async function main() {
  const updatePromise = checkForUpdates(PACKAGE_VERSION).then((result) => {
    updateInfo = result.updateInfo;
  });

  await Promise.race([
    updatePromise,
    new Promise((resolve) => setTimeout(resolve, 100)),
  ]);

  if (parsed.command === "validate") {
    render(
      <ValidateApp
        specFile={parsed.specFile!}
        url={parsed.url!}
        outputDir={parsed.outputDir!}
        jsonLogs={parsed.jsonLogs}
      />
    );
  } else {
    render(
      <App
        initialUrl={parsed.url}
        initialGoals={parsed.goals}
        updateInfo={updateInfo}
        jsonLogs={parsed.jsonLogs}
      />
    );
  }
}

main();
