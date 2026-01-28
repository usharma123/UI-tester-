/**
 * Tests for Auth Fixture Management Module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { formatAuthRequirement, formatCaptchaDetection, formatFixtureList, type AuthRequirement, type CaptchaDetection, type AuthFixture } from "../src/qa/auth.js";

describe("formatAuthRequirement", () => {
  it("should format no auth required", () => {
    const req: AuthRequirement = { type: "none", confidence: 1, details: "" };
    const f = formatAuthRequirement(req);
    assert.ok(f.includes("No authentication required"));
  });

  it("should format form login detection", () => {
    const req: AuthRequirement = {
      type: "form_login", confidence: 0.9,
      loginFormSelector: "form#login", loginUrl: "https://example.com/login",
      details: "Login form detected",
    };
    const f = formatAuthRequirement(req);
    assert.ok(f.includes("form_login"));
    assert.ok(f.includes("90%"));
    assert.ok(f.includes("Login URL"));
    assert.ok(f.includes("Form Selector"));
  });

  it("should format OAuth detection", () => {
    const req: AuthRequirement = { type: "oauth_google", confidence: 0.8, details: "Google sign-in" };
    const f = formatAuthRequirement(req);
    assert.ok(f.includes("oauth_google"));
  });
});

describe("formatCaptchaDetection", () => {
  it("should format no captcha", () => {
    const cap: CaptchaDetection = { type: "none", confidence: 0, details: "" };
    const f = formatCaptchaDetection(cap);
    assert.ok(f.includes("No CAPTCHA"));
  });

  it("should format reCAPTCHA detection", () => {
    const cap: CaptchaDetection = {
      type: "recaptcha_v2", confidence: 0.95,
      selector: ".g-recaptcha", details: "reCAPTCHA v2 detected",
    };
    const f = formatCaptchaDetection(cap);
    assert.ok(f.includes("recaptcha_v2"));
    assert.ok(f.includes("95%"));
    assert.ok(f.includes("Selector"));
  });
});

describe("formatFixtureList", () => {
  it("should format empty list", () => {
    const f = formatFixtureList([]);
    assert.ok(f.includes("No auth fixtures"));
  });

  it("should format fixture list", () => {
    const fixtures: AuthFixture[] = [
      { id: "admin-abc", name: "admin", storageStatePath: "/path", createdAt: Date.now(), tags: ["prod"] },
      { id: "user-xyz", name: "user", storageStatePath: "/path2", createdAt: Date.now() - 10000 },
    ];
    const f = formatFixtureList(fixtures);
    assert.ok(f.includes("admin"));
    assert.ok(f.includes("admin-abc"));
    assert.ok(f.includes("user"));
    assert.ok(f.includes("Tags: prod"));
  });
});
