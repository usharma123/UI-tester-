import { describe, it, expect } from "bun:test";
import { sanitizeSelector } from "../src/qa/selector-sanitizer.js";

describe("sanitizeSelector", () => {
  it("should remove empty name attribute selectors", () => {
    expect(sanitizeSelector("select[name='']")).toBe("select");
    expect(sanitizeSelector("input[name='']")).toBe("input");
  });

  it("should remove empty id attribute selectors", () => {
    expect(sanitizeSelector("div[id='']")).toBe("div");
  });

  it("should remove empty aria-label attribute selectors", () => {
    expect(sanitizeSelector("button[aria-label='']")).toBe("button");
  });

  it("should handle double-quoted empty attributes", () => {
    expect(sanitizeSelector('select[name=""]')).toBe("select");
    expect(sanitizeSelector('input[id=""]')).toBe("input");
  });

  it("should keep valid :first-of-type selectors unchanged", () => {
    expect(sanitizeSelector("select[name='currency']:first-of-type")).toBe("select[name='currency']:first-of-type");
  });

  it("should not remove :first-of-type in other contexts", () => {
    expect(sanitizeSelector("select:first-of-type")).toBe("select:first-of-type");
  });

  it("should strip :has(option[value='...'][selected]) pseudo-selectors", () => {
    expect(
      sanitizeSelector("select:has(option[value='USD'][selected])")
    ).toBe("select:has(option[value='USD'][selected])");
    expect(
      sanitizeSelector("select[name='curr']:has(option[value='EUR'][selected])")
    ).toBe("select[name='curr']:has(option[value='EUR'][selected])");
  });

  it("should pass through clean selectors unchanged", () => {
    expect(sanitizeSelector("button:has-text('Submit')")).toBe("button:has-text('Submit')");
    expect(sanitizeSelector("#my-form select")).toBe("#my-form select");
    expect(sanitizeSelector("input[name='email']")).toBe("input[name='email']");
  });

  it("should handle combined bad patterns", () => {
    expect(
      sanitizeSelector("select[name='']:first-of-type:has(option[value='X'][selected])")
    ).toBe("select");
  });

  it("should throw if result is empty", () => {
    expect(() => sanitizeSelector("[name='']")).toThrow("empty result");
  });

  it("should trim whitespace", () => {
    expect(sanitizeSelector("  select  ")).toBe("select");
  });
});
