/**
 * Auth Fixture Management Module
 * 
 * Manages authentication states for testing authenticated areas
 * of web applications.
 */

import { readFile, writeFile, mkdir, readdir, unlink, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { AgentBrowser } from "../agentBrowser.js";

// ============================================================================
// Types
// ============================================================================

export interface AuthFixture {
  /** Unique identifier for this fixture */
  id: string;
  /** Human-readable name */
  name: string;
  /** Path to the Playwright storage state JSON file */
  storageStatePath: string;
  /** When the fixture was created */
  createdAt: number;
  /** When the fixture expires (optional) */
  expiresAt?: number;
  /** Description of what this auth state represents */
  description?: string;
  /** URL where this auth was captured from */
  sourceUrl?: string;
  /** Tags for organizing fixtures */
  tags?: string[];
}

export interface AuthRequirement {
  /** Type of authentication detected */
  type: AuthType;
  /** Confidence level (0-1) */
  confidence: number;
  /** URL of the login page if found */
  loginUrl?: string;
  /** Selector for the login form if found */
  loginFormSelector?: string;
  /** Details about the detection */
  details: string;
}

export type AuthType =
  | "none"
  | "form_login"
  | "oauth_google"
  | "oauth_github"
  | "oauth_microsoft"
  | "oauth_facebook"
  | "oauth_twitter"
  | "sso"
  | "basic_auth"
  | "api_key"
  | "unknown";

export interface CaptchaDetection {
  /** Type of captcha detected */
  type: CaptchaType;
  /** Confidence level (0-1) */
  confidence: number;
  /** Selector for the captcha element */
  selector?: string;
  /** Additional details */
  details: string;
}

export type CaptchaType =
  | "recaptcha_v2"
  | "recaptcha_v3"
  | "hcaptcha"
  | "turnstile"
  | "funcaptcha"
  | "text_captcha"
  | "unknown"
  | "none";

export interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

export interface AuthManager {
  /** Save the current browser auth state as a fixture */
  saveFixture(browser: AgentBrowser, name: string, options?: SaveFixtureOptions): Promise<AuthFixture>;
  /** Load a fixture by ID or name */
  loadFixture(idOrName: string): Promise<AuthFixture | null>;
  /** List all available fixtures */
  listFixtures(): Promise<AuthFixture[]>;
  /** Delete a fixture */
  deleteFixture(idOrName: string): Promise<boolean>;
  /** Apply a fixture's auth state to the browser */
  applyFixture(browser: AgentBrowser, fixture: AuthFixture): Promise<void>;
  /** Detect authentication requirements on the current page */
  detectAuthRequirement(browser: AgentBrowser): Promise<AuthRequirement>;
  /** Detect captcha on the current page */
  detectCaptcha(browser: AgentBrowser): Promise<CaptchaDetection>;
  /** Check if current browser session is authenticated */
  isAuthenticated(browser: AgentBrowser): Promise<boolean>;
  /** Get the fixtures directory path */
  getFixturesDir(): string;
}

export interface SaveFixtureOptions {
  description?: string;
  tags?: string[];
  expiresIn?: number; // milliseconds
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_FIXTURES_DIR = join(homedir(), ".ui-qa", "auth-fixtures");

// ============================================================================
// Browser Scripts
// ============================================================================

/**
 * Script to detect authentication requirements
 */
const DETECT_AUTH_SCRIPT = `
(function() {
  const result = {
    type: 'none',
    confidence: 0,
    loginUrl: null,
    loginFormSelector: null,
    details: ''
  };
  
  // Check for login form
  const loginForms = document.querySelectorAll('form');
  for (const form of loginForms) {
    const hasPassword = form.querySelector('input[type="password"]');
    const hasEmail = form.querySelector('input[type="email"], input[name*="email"], input[name*="user"]');
    
    if (hasPassword && hasEmail) {
      result.type = 'form_login';
      result.confidence = 0.9;
      result.loginFormSelector = getSelector(form);
      result.details = 'Login form with email/password detected';
      break;
    }
  }
  
  // Check for OAuth buttons
  const oauthPatterns = [
    { type: 'oauth_google', patterns: ['google', 'Sign in with Google', 'Continue with Google', 'accounts.google.com'] },
    { type: 'oauth_github', patterns: ['github', 'Sign in with GitHub', 'Continue with GitHub', 'github.com/login'] },
    { type: 'oauth_microsoft', patterns: ['microsoft', 'Sign in with Microsoft', 'login.microsoftonline.com'] },
    { type: 'oauth_facebook', patterns: ['facebook', 'Sign in with Facebook', 'Continue with Facebook', 'facebook.com/login'] },
    { type: 'oauth_twitter', patterns: ['twitter', 'Sign in with Twitter', 'api.twitter.com'] },
  ];
  
  const pageText = document.body.textContent.toLowerCase();
  const links = Array.from(document.querySelectorAll('a[href], button'));
  
  for (const oauth of oauthPatterns) {
    for (const el of links) {
      const text = (el.textContent || '').toLowerCase();
      const href = (el.href || '').toLowerCase();
      
      if (oauth.patterns.some(p => text.includes(p.toLowerCase()) || href.includes(p.toLowerCase()))) {
        if (result.confidence < 0.8) {
          result.type = oauth.type;
          result.confidence = 0.8;
          result.loginUrl = el.href || null;
          result.details = 'OAuth button detected: ' + oauth.type;
        }
      }
    }
  }
  
  // Check for login/signin links
  if (result.type === 'none') {
    const loginLinks = Array.from(document.querySelectorAll('a[href*="login"], a[href*="signin"], a[href*="sign-in"]'));
    if (loginLinks.length > 0) {
      result.type = 'unknown';
      result.confidence = 0.5;
      result.loginUrl = loginLinks[0].href;
      result.details = 'Login link found';
    }
  }
  
  // Check for SSO indicators
  if (pageText.includes('single sign-on') || pageText.includes('sso') || 
      pageText.includes('enterprise login')) {
    result.type = 'sso';
    result.confidence = 0.7;
    result.details = 'SSO indicator found in page text';
  }
  
  function getSelector(el) {
    if (el.id) return '#' + el.id;
    let selector = el.tagName.toLowerCase();
    if (el.className) {
      const classes = el.className.toString().split(' ').filter(c => c).slice(0, 2);
      if (classes.length) selector += '.' + classes.join('.');
    }
    return selector;
  }
  
  return JSON.stringify(result);
})()
`;

/**
 * Script to detect captcha
 */
const DETECT_CAPTCHA_SCRIPT = `
(function() {
  const result = {
    type: 'none',
    confidence: 0,
    selector: null,
    details: ''
  };
  
  // Check for reCAPTCHA v2
  const recaptchaV2 = document.querySelector('.g-recaptcha, [data-sitekey], iframe[src*="recaptcha"]');
  if (recaptchaV2) {
    result.type = 'recaptcha_v2';
    result.confidence = 0.95;
    result.selector = getSelector(recaptchaV2);
    result.details = 'Google reCAPTCHA v2 detected';
    return JSON.stringify(result);
  }
  
  // Check for reCAPTCHA v3 (invisible)
  const recaptchaV3 = document.querySelector('[data-sitekey][data-size="invisible"], script[src*="recaptcha/api.js?render="]');
  if (recaptchaV3) {
    result.type = 'recaptcha_v3';
    result.confidence = 0.9;
    result.selector = getSelector(recaptchaV3);
    result.details = 'Google reCAPTCHA v3 (invisible) detected';
    return JSON.stringify(result);
  }
  
  // Check for hCaptcha
  const hcaptcha = document.querySelector('.h-captcha, [data-hcaptcha-sitekey], iframe[src*="hcaptcha"]');
  if (hcaptcha) {
    result.type = 'hcaptcha';
    result.confidence = 0.95;
    result.selector = getSelector(hcaptcha);
    result.details = 'hCaptcha detected';
    return JSON.stringify(result);
  }
  
  // Check for Cloudflare Turnstile
  const turnstile = document.querySelector('.cf-turnstile, [data-turnstile-sitekey], iframe[src*="challenges.cloudflare.com"]');
  if (turnstile) {
    result.type = 'turnstile';
    result.confidence = 0.95;
    result.selector = getSelector(turnstile);
    result.details = 'Cloudflare Turnstile detected';
    return JSON.stringify(result);
  }
  
  // Check for FunCaptcha
  const funcaptcha = document.querySelector('#funcaptcha, [data-pkey], iframe[src*="funcaptcha"]');
  if (funcaptcha) {
    result.type = 'funcaptcha';
    result.confidence = 0.9;
    result.selector = getSelector(funcaptcha);
    result.details = 'FunCaptcha detected';
    return JSON.stringify(result);
  }
  
  // Check for text-based captcha
  const captchaInputs = document.querySelectorAll('input[name*="captcha"], input[id*="captcha"], input[placeholder*="captcha"]');
  if (captchaInputs.length > 0) {
    result.type = 'text_captcha';
    result.confidence = 0.7;
    result.selector = getSelector(captchaInputs[0]);
    result.details = 'Text-based CAPTCHA input detected';
    return JSON.stringify(result);
  }
  
  function getSelector(el) {
    if (el.id) return '#' + el.id;
    let selector = el.tagName.toLowerCase();
    if (el.className) {
      const classes = el.className.toString().split(' ').filter(c => c).slice(0, 2);
      if (classes.length) selector += '.' + classes.join('.');
    }
    return selector;
  }
  
  return JSON.stringify(result);
})()
`;

/**
 * Script to check if currently authenticated
 */
const CHECK_AUTH_SCRIPT = `
(function() {
  // Check for common authentication indicators
  const indicators = {
    hasUserMenu: false,
    hasLogoutButton: false,
    hasProfileLink: false,
    hasAuthCookie: false,
    score: 0
  };
  
  // Check for user menu / account elements
  const userElements = document.querySelectorAll(
    '[class*="user-menu"], [class*="profile"], [class*="account"], ' +
    '[aria-label*="account"], [aria-label*="profile"], [aria-label*="user"]'
  );
  if (userElements.length > 0) {
    indicators.hasUserMenu = true;
    indicators.score += 30;
  }
  
  // Check for logout button
  const logoutElements = document.querySelectorAll(
    'a[href*="logout"], a[href*="signout"], a[href*="sign-out"], ' +
    'button:has-text("Log out"), button:has-text("Sign out")'
  );
  // Fallback for button text check
  const buttons = document.querySelectorAll('button, a');
  for (const btn of buttons) {
    const text = (btn.textContent || '').toLowerCase();
    if (text.includes('log out') || text.includes('sign out') || text.includes('logout')) {
      indicators.hasLogoutButton = true;
      indicators.score += 40;
      break;
    }
  }
  
  // Check for profile/dashboard link
  const profileLinks = document.querySelectorAll(
    'a[href*="profile"], a[href*="dashboard"], a[href*="account"], a[href*="settings"]'
  );
  if (profileLinks.length > 0) {
    indicators.hasProfileLink = true;
    indicators.score += 20;
  }
  
  // Check for auth cookies
  const cookies = document.cookie;
  if (cookies.includes('session') || cookies.includes('token') || 
      cookies.includes('auth') || cookies.includes('user')) {
    indicators.hasAuthCookie = true;
    indicators.score += 10;
  }
  
  return JSON.stringify(indicators);
})()
`;

/**
 * Script to extract storage state for saving
 */
const EXTRACT_STORAGE_SCRIPT = `
(function() {
  const result = {
    localStorage: {},
    sessionStorage: {}
  };
  
  // Extract localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      result.localStorage[key] = localStorage.getItem(key);
    }
  }
  
  // Extract sessionStorage
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key) {
      result.sessionStorage[key] = sessionStorage.getItem(key);
    }
  }
  
  return JSON.stringify(result);
})()
`;

// ============================================================================
// Auth Manager Implementation
// ============================================================================

/**
 * Create an auth manager
 */
export function createAuthManager(fixturesDir?: string): AuthManager {
  const dir = fixturesDir || DEFAULT_FIXTURES_DIR;

  // Ensure fixtures directory exists
  async function ensureDir(): Promise<void> {
    try {
      await mkdir(dir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }

  // Get fixture metadata path
  function getMetadataPath(id: string): string {
    return join(dir, `${id}.json`);
  }

  // Get storage state path
  function getStorageStatePath(id: string): string {
    return join(dir, `${id}.state.json`);
  }

  // Generate fixture ID from name
  function generateId(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const timestamp = Date.now().toString(36);
    return `${slug}-${timestamp}`;
  }

  return {
    async saveFixture(
      browser: AgentBrowser,
      name: string,
      options: SaveFixtureOptions = {}
    ): Promise<AuthFixture> {
      await ensureDir();

      const id = generateId(name);
      const storageStatePath = getStorageStatePath(id);
      const metadataPath = getMetadataPath(id);
      const currentUrl = await browser.getCurrentUrl();

      // Extract storage state from browser
      const storageJson = await browser.eval(EXTRACT_STORAGE_SCRIPT);
      const storage = JSON.parse(storageJson);

      // Get cookies via page context (this is a simplified version)
      // In a real implementation, we'd use Playwright's context.storageState()
      const storageState: StorageState = {
        cookies: [], // Would be populated from browser context
        origins: [
          {
            origin: new URL(currentUrl).origin,
            localStorage: Object.entries(storage.localStorage).map(([name, value]) => ({
              name,
              value: value as string,
            })),
          },
        ],
      };

      // Save storage state
      await writeFile(storageStatePath, JSON.stringify(storageState, null, 2));

      // Create fixture metadata
      const fixture: AuthFixture = {
        id,
        name,
        storageStatePath,
        createdAt: Date.now(),
        expiresAt: options.expiresIn ? Date.now() + options.expiresIn : undefined,
        description: options.description,
        sourceUrl: currentUrl,
        tags: options.tags,
      };

      // Save metadata
      await writeFile(metadataPath, JSON.stringify(fixture, null, 2));

      return fixture;
    },

    async loadFixture(idOrName: string): Promise<AuthFixture | null> {
      await ensureDir();

      // Try to load by ID first
      const byIdPath = getMetadataPath(idOrName);
      try {
        const content = await readFile(byIdPath, "utf-8");
        return JSON.parse(content) as AuthFixture;
      } catch {
        // Not found by ID, try by name
      }

      // Search by name
      const fixtures = await this.listFixtures();
      return fixtures.find(f => f.name === idOrName || f.id === idOrName) || null;
    },

    async listFixtures(): Promise<AuthFixture[]> {
      await ensureDir();

      try {
        const files = await readdir(dir);
        const fixtures: AuthFixture[] = [];

        for (const file of files) {
          if (file.endsWith(".json") && !file.endsWith(".state.json")) {
            try {
              const content = await readFile(join(dir, file), "utf-8");
              const fixture = JSON.parse(content) as AuthFixture;

              // Check if expired
              if (fixture.expiresAt && fixture.expiresAt < Date.now()) {
                continue; // Skip expired fixtures
              }

              fixtures.push(fixture);
            } catch {
              // Skip invalid files
            }
          }
        }

        return fixtures.sort((a, b) => b.createdAt - a.createdAt);
      } catch {
        return [];
      }
    },

    async deleteFixture(idOrName: string): Promise<boolean> {
      const fixture = await this.loadFixture(idOrName);
      if (!fixture) {
        return false;
      }

      try {
        // Delete metadata file
        await unlink(getMetadataPath(fixture.id));

        // Delete storage state file
        try {
          await unlink(fixture.storageStatePath);
        } catch {
          // Storage state might not exist
        }

        return true;
      } catch {
        return false;
      }
    },

    async applyFixture(browser: AgentBrowser, fixture: AuthFixture): Promise<void> {
      // Load storage state
      const storageStateContent = await readFile(fixture.storageStatePath, "utf-8");
      const storageState = JSON.parse(storageStateContent) as StorageState;

      // Apply localStorage
      for (const origin of storageState.origins) {
        const items = origin.localStorage;
        if (items.length > 0) {
          const script = `
            (function() {
              const items = ${JSON.stringify(items)};
              for (const item of items) {
                localStorage.setItem(item.name, item.value);
              }
            })()
          `;
          await browser.eval(script);
        }
      }

      // Note: Applying cookies requires Playwright context access
      // This would need to be done at the browser context level
      // For now, localStorage is applied
    },

    async detectAuthRequirement(browser: AgentBrowser): Promise<AuthRequirement> {
      try {
        const resultJson = await browser.eval(DETECT_AUTH_SCRIPT);
        return JSON.parse(resultJson) as AuthRequirement;
      } catch {
        return {
          type: "unknown",
          confidence: 0,
          details: "Failed to detect auth requirement",
        };
      }
    },

    async detectCaptcha(browser: AgentBrowser): Promise<CaptchaDetection> {
      try {
        const resultJson = await browser.eval(DETECT_CAPTCHA_SCRIPT);
        return JSON.parse(resultJson) as CaptchaDetection;
      } catch {
        return {
          type: "none",
          confidence: 0,
          details: "Failed to detect captcha",
        };
      }
    },

    async isAuthenticated(browser: AgentBrowser): Promise<boolean> {
      try {
        const resultJson = await browser.eval(CHECK_AUTH_SCRIPT);
        const indicators = JSON.parse(resultJson);
        // Consider authenticated if score >= 40 (logout button alone or user menu + something)
        return indicators.score >= 40;
      } catch {
        return false;
      }
    },

    getFixturesDir(): string {
      return dir;
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format auth requirement for display
 */
export function formatAuthRequirement(auth: AuthRequirement): string {
  if (auth.type === "none") {
    return "No authentication required";
  }

  const lines: string[] = [];
  lines.push(`Auth Type: ${auth.type} (${(auth.confidence * 100).toFixed(0)}% confidence)`);
  lines.push(`Details: ${auth.details}`);

  if (auth.loginUrl) {
    lines.push(`Login URL: ${auth.loginUrl}`);
  }

  if (auth.loginFormSelector) {
    lines.push(`Form Selector: ${auth.loginFormSelector}`);
  }

  return lines.join("\n");
}

/**
 * Format captcha detection for display
 */
export function formatCaptchaDetection(captcha: CaptchaDetection): string {
  if (captcha.type === "none") {
    return "No CAPTCHA detected";
  }

  const lines: string[] = [];
  lines.push(`CAPTCHA Type: ${captcha.type} (${(captcha.confidence * 100).toFixed(0)}% confidence)`);
  lines.push(`Details: ${captcha.details}`);

  if (captcha.selector) {
    lines.push(`Selector: ${captcha.selector}`);
  }

  return lines.join("\n");
}

/**
 * Format fixture list for display
 */
export function formatFixtureList(fixtures: AuthFixture[]): string {
  if (fixtures.length === 0) {
    return "No auth fixtures saved";
  }

  return fixtures
    .map(f => {
      const created = new Date(f.createdAt).toLocaleString();
      const tags = f.tags?.join(", ") || "";
      return `- ${f.name} (${f.id})\n  Created: ${created}${tags ? `\n  Tags: ${tags}` : ""}`;
    })
    .join("\n\n");
}

