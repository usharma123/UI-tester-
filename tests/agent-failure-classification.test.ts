import { describe, it, expect } from "bun:test";
import { classifyFailure } from "../src/qa/agent.js";
import type { FailureClass } from "../src/qa/agent.js";

describe("classifyFailure", () => {
  describe("hard failures", () => {
    const hardErrors = [
      "target closed",
      "Target closed unexpectedly",
      "navigation failed: net::ERR_ABORTED",
      "crash: page crashed",
      "frame was detached",
      "execution context was destroyed",
    ];

    for (const error of hardErrors) {
      it(`should classify "${error}" as hard`, () => {
        expect(classifyFailure(error, "click")).toBe("hard");
      });
    }
  });

  it("should classify selector misses as soft for recoverable actions", () => {
    expect(classifyFailure("element not found in DOM", "click")).toBe("soft");
    expect(classifyFailure("no element matches selector", "select")).toBe("soft");
    expect(classifyFailure("element not found in DOM", "hover")).toBe("soft");
  });

  describe("soft failures", () => {
    const softErrors = [
      "No observable change after click",
      "timeout 30000ms exceeded",
      "Element is covered by div.overlay",
      "Element is disabled",
      "Element is not visible",
      undefined,
    ];

    for (const error of softErrors) {
      it(`should classify "${error ?? "undefined"}" as soft`, () => {
        expect(classifyFailure(error, "click")).toBe("soft");
      });
    }
  });

  it("should classify undefined error as soft regardless of action type", () => {
    expect(classifyFailure(undefined, "click")).toBe("soft");
    expect(classifyFailure(undefined, "select")).toBe("soft");
    expect(classifyFailure(undefined, "fill")).toBe("soft");
  });

  it("should be case-insensitive for error pattern matching", () => {
    expect(classifyFailure("TARGET CLOSED", "click")).toBe("hard");
    expect(classifyFailure("Navigation Failed", "navigate")).toBe("hard");
  });
});
