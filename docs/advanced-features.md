# Advanced Features

This page covers advanced testing features including coverage-guided exploration, visual audits, state tracking, and auth fixture management.

## Coverage-Guided Exploration

Coverage-guided exploration is an intelligent testing engine that uses state fingerprinting and coverage tracking to systematically explore websites. Unlike traditional plan-based testing, it dynamically selects actions based on their potential to increase coverage.

### How It Works

1. **State Fingerprinting**: Creates unique fingerprints for each page state by hashing:
   - URL path and query parameters
   - DOM structure (ignoring transient elements)
   - Form states (input values, checkbox states)
   - Dialog/modal states
   - Visible text content

2. **Coverage Tracking**: Monitors:
   - Unique URLs visited
   - Forms interacted with
   - Dialogs/modals opened
   - Network requests triggered
   - Console errors encountered
   - Elements interacted with

3. **Action Scoring**: Each potential action is scored by:
   - **Novelty** (0-10): Potential to discover new URLs, forms, or dialogs
   - **Business Criticality** (0-10): Importance (CTAs, forms, navigation)
   - **Risk** (0-10): Likelihood to reveal issues (forms > links > toggles)
   - **Branch Factor** (0-10): Expected number of new states

4. **Budget Management**: Enforces limits to prevent infinite loops:
   - Maximum steps per state
   - Maximum unique states
   - Maximum total steps
   - Stagnation threshold (steps without coverage gain)
   - Maximum depth
   - Time limit

### Enabling Coverage-Guided Exploration

```bash
# Enable via environment variable
COVERAGE_GUIDED=true npx @usharma124/ui-qa https://example.com

# Or in .env file
COVERAGE_GUIDED=true
EXPLORATION_MODE=coverage_guided
BEAM_WIDTH=3
```

### Exploration Strategies

#### Coverage-Guided (Default)

Scores actions using all factors (novelty, criticality, risk, branch factor) and selects top N actions.

```bash
EXPLORATION_MODE=coverage_guided
BEAM_WIDTH=3  # Explore top 3 actions
```

#### Breadth-First

Prioritizes visiting new URLs over deep exploration.

```bash
EXPLORATION_MODE=breadth_first
```

#### Depth-First

Explores deeply before backtracking, useful for testing complex flows.

```bash
EXPLORATION_MODE=depth_first
```

#### Random

Random action selection, useful for fuzzing or stress testing.

```bash
EXPLORATION_MODE=random
```

### Budget Configuration

Fine-tune exploration limits:

```ini
# Steps and States
BUDGET_MAX_STEPS_PER_STATE=10      # Max steps per unique state
BUDGET_MAX_UNIQUE_STATES=100        # Max unique states to visit
BUDGET_MAX_TOTAL_STEPS=500          # Max total steps

# Stagnation Detection
BUDGET_STAGNATION_THRESHOLD=15      # Stop if no coverage gain for N steps

# Depth and Time
BUDGET_MAX_DEPTH=10                 # Max exploration depth
BUDGET_MAX_TIME_MS=600000           # Time limit (10 minutes)
```

### When to Use

**Use coverage-guided exploration when:**
- You want comprehensive coverage of a website
- Testing complex multi-page flows
- Need to discover all interactive elements
- Testing dynamic SPAs with many states

**Use traditional planning when:**
- Testing specific user flows
- Need deterministic test plans
- Testing simple static sites
- Want faster, focused testing

## Visual Audits

Visual audits use fast browser-based heuristics to detect common UI/UX issues without requiring external tools or image comparison.

### Detected Issues

#### Overlapping Clickables

Detects when clickable elements overlap, making them difficult to interact with.

**Example:**
```json
{
  "type": "overlapping_clickables",
  "severity": "high",
  "message": "Clickable elements overlap: button.submit and a.link",
  "overlapArea": 250
}
```

#### Clipped Text

Identifies text that's cut off due to `overflow: hidden` or `text-overflow: ellipsis`.

**Example:**
```json
{
  "type": "clipped_text",
  "severity": "medium",
  "message": "Text is clipped: 'This is a long text that...'",
  "clippedWidth": 45
}
```

#### Small Tap Targets

Flags interactive elements smaller than 44×44px (WCAG minimum).

**Example:**
```json
{
  "type": "small_tap_target",
  "severity": "high",
  "message": "Small tap target (32x28px): 'Submit'",
  "width": 32,
  "height": 28
}
```

#### Off-Screen Primary CTAs

Detects primary call-to-action buttons that are outside the viewport.

**Example:**
```json
{
  "type": "offscreen_primary_cta",
  "severity": "high",
  "message": "Primary CTA is off-screen: 'Sign Up'"
}
```

#### Fixed Header Covering Content

Identifies fixed headers that cover more than 20% of the viewport.

**Example:**
```json
{
  "type": "fixed_header_covering",
  "severity": "medium",
  "message": "Fixed header covers 25% of viewport",
  "coveragePercent": 25
}
```

#### Horizontal Overflow

Detects pages wider than the viewport.

**Example:**
```json
{
  "type": "horizontal_overflow",
  "severity": "high",
  "message": "Page has 120px horizontal overflow"
}
```

#### Missing Focus Indicators

Flags focusable elements without visible focus indicators.

**Example:**
```json
{
  "type": "missing_focus_indicator",
  "severity": "medium",
  "message": "Missing focus indicator on button: 'Submit'"
}
```

### Configuration

```ini
# Enable visual audits
VISUAL_AUDITS=true

# Screenshot baseline directory
BASELINE_DIR=.ui-qa/baselines

# Visual diff threshold (0-100)
DIFF_THRESHOLD=5
```

### Visual Regression Testing

Visual audits can be combined with screenshot baselines for regression testing:

1. Capture baseline screenshots on first run
2. Compare subsequent runs against baselines
3. Flag visual changes exceeding threshold

**Auto-masked regions:**
- Timestamps
- Avatars/profile images
- Ads and tracking elements
- Dynamic content

## State Tracking

State tracking prevents redundant testing by detecting when you've visited the same page state before.

### State Fingerprinting

Each page state is fingerprinted using:

1. **URL Hash**: Pathname and query parameters (ignoring origin)
2. **DOM Structure Hash**: Tag hierarchy (ignoring transient elements)
3. **Form State Hash**: Input values and checkbox states
4. **Dialog State Hash**: Open modals/dialogs
5. **Combined Hash**: Quick comparison hash

### Transient Elements

The following elements are ignored in fingerprinting (they don't represent meaningful state changes):

- Loading indicators (`[class*="loading"]`, `[aria-busy="true"]`)
- Toasts and notifications (`[class*="toast"]`, `[role="alert"]`)
- Timestamps (`time`, `[class*="timestamp"]`)
- Avatars (`[class*="avatar"]`)
- Ads (`iframe[src*="ads"]`)

### State Transitions

State transitions are recorded with:
- Source state fingerprint
- Target state fingerprint
- Action that caused the transition
- Whether it's a new state or revisit

### Benefits

- **Avoids redundant testing**: Skips revisiting identical states
- **Tracks exploration progress**: Knows which states have been tested
- **Detects loops**: Identifies when exploration is stuck in cycles
- **Improves coverage**: Focuses on untested states

## Auth Fixture Management

Auth fixtures allow you to save and reuse authentication states for testing authenticated areas of websites.

### Supported Auth Types

#### Form-Based Login

Detects email/password forms and can save the authenticated state.

#### OAuth Providers

Automatically detects:
- Google (`accounts.google.com`)
- GitHub (`github.com/login`)
- Microsoft (`login.microsoftonline.com`)
- Facebook (`facebook.com/login`)
- Twitter (`api.twitter.com`)

#### SSO (Single Sign-On)

Detects SSO indicators in page content.

### Saving Auth Fixtures

1. **Manual Process**:
   - Navigate to login page
   - Authenticate manually
   - Save the browser state

2. **Programmatic** (via API):
   ```typescript
   import { createAuthManager } from '@usharma124/ui-qa';
   
   const authManager = createAuthManager();
   const fixture = await authManager.saveFixture(browser, 'production-user', {
     description: 'Production user account',
     tags: ['production', 'admin']
   });
   ```

### Using Auth Fixtures

```bash
# Via environment variable
AUTH_FIXTURE=production-user npx @usharma124/ui-qa https://app.example.com

# Or in .env file
AUTH_FIXTURE=production-user
```

### Fixture Storage

Fixtures are stored in `.ui-qa/auth-fixtures/`:

```
.ui-qa/auth-fixtures/
├── production-user-abc123.json      # Metadata
└── production-user-abc123.state.json # Storage state
```

### Fixture Metadata

```json
{
  "id": "production-user-abc123",
  "name": "production-user",
  "storageStatePath": ".ui-qa/auth-fixtures/production-user-abc123.state.json",
  "createdAt": 1234567890,
  "expiresAt": 1234567890,
  "description": "Production user account",
  "sourceUrl": "https://app.example.com",
  "tags": ["production", "admin"]
}
```

### CAPTCHA Detection

The auth manager can detect various CAPTCHA types:

- **reCAPTCHA v2**: Traditional checkbox CAPTCHA
- **reCAPTCHA v3**: Invisible CAPTCHA
- **hCaptcha**: Privacy-focused alternative
- **Cloudflare Turnstile**: Cloudflare's CAPTCHA
- **FunCaptcha**: Game-based CAPTCHA
- **Text CAPTCHA**: Image-based text challenges

When CAPTCHA is detected, manual intervention is required.

## Best Practices

### Coverage-Guided Exploration

1. **Start with conservative budgets**: Begin with default values and adjust based on site complexity
2. **Monitor stagnation**: If exploration stops due to stagnation, review coverage gaps
3. **Use appropriate strategies**: 
   - `breadth_first` for site mapping
   - `depth_first` for flow testing
   - `coverage_guided` for comprehensive testing
4. **Combine with traditional planning**: Use coverage-guided for discovery, then traditional planning for specific flows

### Visual Audits

1. **Review visual issues by severity**: Focus on high-severity issues first
2. **Use baselines for regression**: Capture baselines after major UI changes
3. **Adjust thresholds**: Lower `DIFF_THRESHOLD` for stricter visual regression testing
4. **Mask dynamic content**: Ensure timestamps and avatars are properly masked

### Auth Fixtures

1. **Use separate fixtures per environment**: Create fixtures for staging, production, etc.
2. **Set expiration dates**: Configure `expiresAt` for fixtures that expire
3. **Tag fixtures**: Use tags to organize fixtures (`production`, `admin`, `test-user`)
4. **Rotate credentials**: Update fixtures when passwords change
5. **Handle CAPTCHA**: Be aware that CAPTCHA-protected auth requires manual intervention

## Troubleshooting

### Coverage-Guided Exploration Stops Early

**Problem**: Exploration stops before expected coverage.

**Solutions**:
- Increase `BUDGET_MAX_TOTAL_STEPS`
- Increase `BUDGET_MAX_UNIQUE_STATES`
- Increase `BUDGET_STAGNATION_THRESHOLD`
- Check if site requires authentication

### Visual Audits Missing Issues

**Problem**: Visual audits don't detect known issues.

**Solutions**:
- Ensure `VISUAL_AUDITS=true`
- Check viewport size matches issue conditions
- Verify elements are visible (not `display: none`)

### Auth Fixtures Not Working

**Problem**: Auth fixture doesn't restore session.

**Solutions**:
- Verify fixture was saved correctly
- Check if session expired
- Ensure cookies/localStorage are being applied
- Try recreating the fixture

### State Tracking Too Aggressive

**Problem**: Different states are being treated as identical.

**Solutions**:
- Review transient element filters
- Check if dynamic content is being ignored
- Adjust fingerprinting sensitivity (requires code changes)
