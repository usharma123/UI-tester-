import { describe, it, expect } from "bun:test";
import {
  DEFAULT_OUTPUT_DIR,
  getHelpText,
  getValidationError,
  parseArgs,
} from "../src/cli/args.js";

describe("parseArgs", () => {
  it("sets defaults for test command", () => {
    const result = parseArgs([]);

    expect(result.command).toBe("test");
    expect(result.help).toBe(false);
    expect(result.outputDir).toBe(DEFAULT_OUTPUT_DIR);
    expect(result.url).toBeUndefined();
    expect(result.goals).toBeUndefined();
    expect(result.specFile).toBeUndefined();
  });

  it("parses validate command with long flags", () => {
    const result = parseArgs([
      "validate",
      "--spec",
      "./requirements.md",
      "--url",
      "https://example.com",
      "--output",
      "./out",
    ]);

    expect(result.command).toBe("validate");
    expect(result.specFile).toBe("./requirements.md");
    expect(result.url).toBe("https://example.com");
    expect(result.outputDir).toBe("./out");
  });

  it("parses short flags and positional url", () => {
    const result = parseArgs(["-g", "checkout flow", "https://example.com"]);

    expect(result.command).toBe("test");
    expect(result.goals).toBe("checkout flow");
    expect(result.url).toBe("https://example.com");
  });

  it("parses help for validate command", () => {
    const result = parseArgs(["validate", "-h"]);

    expect(result.command).toBe("validate");
    expect(result.help).toBe(true);
  });

  it("accepts positional url for validate", () => {
    const result = parseArgs(["validate", "https://example.com", "--spec", "./spec.md"]);

    expect(result.command).toBe("validate");
    expect(result.url).toBe("https://example.com");
    expect(result.specFile).toBe("./spec.md");
  });
});

describe("getHelpText", () => {
  it("returns validate usage", () => {
    const text = getHelpText("validate");

    expect(text).toContain("UI QA Agent - Business Logic Validation");
    expect(text).toContain("ui-qa validate --spec <file> --url <url>");
    expect(text).toContain("OPENROUTER_API_KEY");
  });

  it("returns default usage", () => {
    const text = getHelpText("test");

    expect(text).toContain("UI QA Agent - AI-powered website testing");
    expect(text).toContain("ui-qa [url] [options]");
    expect(text).toContain("ui-qa validate --spec <file> --url <url>");
  });
});

describe("getValidationError", () => {
  it("returns null for test command", () => {
    const result = parseArgs([]);

    expect(getValidationError(result)).toBeNull();
  });

  it("returns error when spec is missing", () => {
    const result = parseArgs(["validate", "--url", "https://example.com"]);

    expect(getValidationError(result)).toBe(
      "Error: --spec <file> is required for validate command"
    );
  });

  it("returns error when url is missing", () => {
    const result = parseArgs(["validate", "--spec", "./spec.md"]);

    expect(getValidationError(result)).toBe(
      "Error: --url <url> is required for validate command"
    );
  });
});
