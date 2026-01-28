# Advanced QA Agent Architecture Implementation Plan

## Overview

Enhance the UI QA testing CLI with coverage-guided exploration, state fingerprinting, budget controls, and visual regression capabilities.

---

## Phase 1: Core Infrastructure (State, Budget, Coverage)
**Files to create:**

### `src/qa/state.ts` - State Fingerprinting
```typescript
interface StateFingerprint {
  urlHash: string;
  domStructureHash: string;
  visibleTextHash: string;
  formStateHash: string;
  dialogStateHash: string;
  authStateId?: string;
}
```
- Compute DOM fingerprints ignoring transient elements (toasts, spinners, timestamps)
- Track state history and transitions
- Detect revisits to collapse equivalent states

### `src/qa/budget.ts` - Budget Management
```typescript
interface BudgetConfig {
  maxStepsPerPageState: number;  // 10
  maxUniqueStates: number;       // 100
  maxTotalSteps: number;         // 500
  stagnationThreshold: number;   // 15 steps without coverage gain
}
```
- Track steps used, unique states visited, current depth
- Detect stagnation (no coverage gain for N steps)
- Expose `canContinue()` for exploration loop

### `src/qa/coverage.ts` - Coverage Tracking
```typescript
interface CoverageMetrics {
  uniqueUrls: Set<string>;
  uniqueDialogs: Set<string>;
  uniqueForms: Set<string>;
  uniqueNetworkRequests: Set<string>;
  uniqueConsoleErrors: Set<string>;
  interactedElements: Set<string>;
}
```
- Track coverage signals during exploration
- Calculate coverage gain between snapshots
- Record which actions yielded coverage

### `src/qa/types.ts` - Update
- Export new types from state, budget, coverage modules
- Extend `ExecutedStep` with `stateBeforeFingerprint`, `stateAfterFingerprint`, `coverageGain`

---

## Phase 2: Coverage-Guided Exploration Engine
**Files to create:**

### `src/qa/explorer.ts` - Main Exploration Engine
```typescript
interface ActionCandidate {
  selector: string;
  actionType: 'click' | 'fill' | 'hover' | 'press';
  priorityScore: number;
  scoreBreakdown: {
    novelty: number;           // New URL/form/modal potential (0-10)
    businessCriticality: number; // CTA buttons, forms (0-10)
    risk: number;              // Forms > links > toggles (0-10)
    branchFactor: number;      // Expected new states (0-10)
  };
}
```
- Score all candidate actions by coverage potential
- Implement best-first/beam search (width=3)
- Track which action types frequently reveal issues

### `src/qa/action-selector.ts` - Action Prioritization
- Score actions: +10 CTA buttons, +8 form submissions, +6 expandables, +3 generic
- Prioritize unvisited URLs, unsubmitted forms, unopened modals
- Decay novelty for repeated action types on same component

### `src/qa/planner.ts` - Update
- Add `buildCoverageAwarePlannerPrompt()` with coverage context
- Include visited URLs, untested forms, suggested priorities in prompt

---

## Phase 3: Enhanced Actionability & Stability
**Files to modify:**

### `src/agentBrowser.ts` - Update
```typescript
interface ActionabilityResult {
  isActionable: boolean;
  issues: Array<{
    type: 'not_visible' | 'disabled' | 'aria_busy' | 'bbox_unstable' | 'covered';
    details: string;
  }>;
  confidence: number;
}
```
- Add `checkActionability(selector)` - check visible, enabled, not aria-busy, not covered
- Add `waitForStability(options)` - wait for no DOM mutations for 300ms (configurable)
- Replace `networkidle` with stability window detection
- Add `detectActionOutcome()` - distinguish "not hydrated" vs "broken handler"

**Success Signals:**
- URL changed -> navigation success
- Network request triggered -> data operation
- DOM significantly changed -> UI update
- Dialog opened -> modal interaction
- Console error -> broken handler
- No changes -> possibly not hydrated or no-op

---

## Phase 4: Visual Regression Layer
**Files to create:**

### `src/qa/visual.ts` - Visual Heuristics
```typescript
type VisualIssueType =
  | 'overlapping_clickables'  // Bbox intersection of clickable elements
  | 'clipped_text'            // scrollWidth > clientWidth with overflow:hidden
  | 'small_tap_target'        // < 44x44px (already in audits.ts)
  | 'offscreen_primary_cta'   // Primary CTA outside viewport
  | 'fixed_header_covering'   // Fixed element covering content
  | 'horizontal_overflow';    // Page wider than viewport
```
- Run fast heuristics in browser context
- Return issues with bounding boxes for screenshots

### Screenshot Baseline System
```typescript
interface ScreenshotBaseline {
  routeId: string;
  baselineImagePath: string;
  viewport: ViewportConfig;
  masks: MaskRegion[];  // Regions to ignore (timestamps, avatars, ads)
}
```
- Auto-mask: `time`, `[datetime]`, `.timestamp`, `.avatar`, `iframe[src*="ad"]`
- Store baselines in `.ui-qa/baselines/`
- Compare with configurable diff threshold (default 5%)

### `src/qa/audits.ts` - Update
- Add `runVisualHeuristics()` integrated with existing DOM audits
- Combine into `runFullAudit()` returning both DOM and visual results

---

## Phase 5: Auth Fixture Management
**Files to create:**

### `src/qa/auth.ts` - Auth Management
```typescript
interface AuthFixture {
  id: string;
  name: string;
  storageState: string;  // Path to Playwright storage state JSON
  createdAt: number;
  expiresAt?: number;
}
```
- `loadFixture(id)` / `saveFixture(fixture)` / `listFixtures()`
- `detectAuthRequirement(page)` - identify login forms, OAuth, SSO
- `detectCaptcha(page)` - identify reCAPTCHA, hCaptcha, Turnstile
- `applyAuthState(context, fixture)` - inject cookies/localStorage

**Detection Patterns:**
- Google: `accounts.google.com`, "Sign in with Google"
- GitHub: `github.com/login`, "Sign in with GitHub"
- Generic: `login`, `sign in`, `password`
- Captcha: `g-recaptcha`, `h-captcha`, `cf-turnstile`

### CLI Integration
- `ui-qa auth save <name>` - Save current browser auth state
- `ui-qa auth load <name>` - Load auth state for testing
- `ui-qa --auth <fixture>` - Run tests with auth fixture

---

## Phase 6: Integration
**Files to modify:**

### `src/qa/run-streaming.ts` - Main Integration
```typescript
// Initialize trackers
const coverage = createCoverageTracker();
const state = createStateTracker();
const budget = createBudgetTracker(config.budgetConfig);

// Modified traversal with coverage-guided exploration
while (budget.canContinue()) {
  const nextActions = await explorer.selectNextActions(candidates, context);
  if (nextActions.length === 0) break;

  for (const action of nextActions) {
    const result = await executeAction(browser, action);
    coverage.recordOutcome(result);
    state.recordTransition(result);
    budget.recordStep(result.coverageGained > 0);
  }
}
```

### `src/config.ts` - New Options
```typescript
budgetConfig: BudgetConfig;
explorationMode: 'coverage_guided' | 'breadth_first';
beamWidth: number;
visualAuditsEnabled: boolean;
baselineDir: string;
diffThreshold: number;
authFixtureDir: string;
```

### `src/prompts/planner.ts` - Coverage Context
- Add coverage status to planner prompt (visited URLs, untested forms)
- Include priority recommendations based on coverage analysis

---

## Critical Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/qa/state.ts` | Create | State fingerprinting |
| `src/qa/budget.ts` | Create | Budget management |
| `src/qa/coverage.ts` | Create | Coverage tracking |
| `src/qa/explorer.ts` | Create | Coverage-guided exploration |
| `src/qa/action-selector.ts` | Create | Action prioritization |
| `src/qa/visual.ts` | Create | Visual heuristics |
| `src/qa/auth.ts` | Create | Auth fixtures |
| `src/agentBrowser.ts` | Modify | Actionability, stability |
| `src/qa/run-streaming.ts` | Modify | Main integration |
| `src/qa/audits.ts` | Modify | Add visual audits |
| `src/qa/planner.ts` | Modify | Coverage context |
| `src/qa/types.ts` | Modify | New type exports |
| `src/config.ts` | Modify | New config options |

---

## Verification Plan

1. **Unit Tests**: Create tests for state fingerprinting, budget exhaustion, coverage calculation
2. **Integration Test**: Run against a test site with known structure
   - Verify budget terminates at threshold
   - Verify state revisits are detected
   - Verify coverage metrics increase
3. **Visual Test**: Capture baselines, make CSS changes, verify diff detection
4. **Auth Test**: Save fixture, clear browser, load fixture, verify session restored

---

## Implementation Order

1. **Phase 1** (state/budget/coverage) - Foundation, no dependencies
2. **Phase 3** (actionability/stability) - Can be done in parallel with Phase 1
3. **Phase 2** (explorer) - Depends on Phase 1
4. **Phase 4** (visual) - Depends on Phase 3
5. **Phase 5** (auth) - Independent, can be done anytime
6. **Phase 6** (integration) - Final, depends on all phases

---

## Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │           run-streaming.ts              │
                    │         (Main Orchestrator)             │
                    └─────────────────┬───────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   explorer.ts   │       │  agentBrowser   │       │    planner.ts   │
│ (Exploration    │◄─────►│  (Browser       │◄─────►│  (LLM-based     │
│  Engine)        │       │   Automation)   │       │   Planning)     │
└────────┬────────┘       └────────┬────────┘       └─────────────────┘
         │                         │
         │         ┌───────────────┴───────────────┐
         │         │                               │
         ▼         ▼                               ▼
┌─────────────────────┐                 ┌─────────────────┐
│   Core Trackers     │                 │  Visual Layer   │
│ ┌─────────────────┐ │                 │ ┌─────────────┐ │
│ │   coverage.ts   │ │                 │ │  visual.ts  │ │
│ └─────────────────┘ │                 │ └─────────────┘ │
│ ┌─────────────────┐ │                 │ ┌─────────────┐ │
│ │    state.ts     │ │                 │ │  audits.ts  │ │
│ └─────────────────┘ │                 │ └─────────────┘ │
│ ┌─────────────────┐ │                 │ ┌─────────────┐ │
│ │   budget.ts     │ │                 │ │  baselines  │ │
│ └─────────────────┘ │                 │ └─────────────┘ │
└─────────────────────┘                 └─────────────────┘
         │
         ▼
┌─────────────────┐
│    auth.ts      │
│  (Auth Fixture  │
│   Management)   │
└─────────────────┘
```

---

## Key Algorithms

### State Fingerprinting
```
1. Extract DOM structure (tag hierarchy, not content)
2. Filter transient elements: [toast, spinner, loading, timestamp]
3. Hash: MurmurHash3(structure + forms + dialogs + url)
4. Compare to history for revisit detection
```

### Action Scoring
```
score =
  (novelty × 0.35) +
  (businessCriticality × 0.25) +
  (risk × 0.25) +
  (branchFactor × 0.15)

Where:
  novelty = 10 if leads to new URL, 8 if new form, 6 if expandable
  businessCriticality = 10 for CTA, 7 for forms, 5 for nav
  risk = 8 for forms (high signal), 5 for modals, 3 for links
  branchFactor = estimated new states (forms: 3-5, accordions: 2-3)
```

### Budget Exhaustion
```
Stop if ANY:
  - stepsUsed >= maxTotalSteps
  - uniqueStates >= maxUniqueStates
  - stepsSinceLastCoverageGain >= stagnationThreshold
  - currentDepth >= maxDepth AND no promising actions
```

### Stability Detection
```
1. Capture DOM hash (element count + text length + modal count)
2. Wait checkInterval (100ms)
3. Recapture hash
4. If unchanged, increment stableFor
5. If stableFor >= stabilityWindowMs (300ms), return stable
6. If elapsed >= maxWaitMs (5000ms), return timeout
```
