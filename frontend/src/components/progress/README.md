# Progress Indicator Redesign

## Overview

This document describes the redesigned progress indicator system for the UI testing agent. The new design addresses several key issues:

1. **Bounded progress** - Progress never exceeds its limits
2. **Clear hierarchy** - Phases vs tasks are explicitly distinguished
3. **Visual affordance** - Active state is clearly distinct
4. **Iterative support** - Supports loops and retries
5. **Unambiguous timing** - Elapsed time is clearly labeled
6. **Semantic icons** - Consistent meaning with labels
7. **Accessibility** - ARIA labels, contrast, screen reader support

## State Model

### Hierarchy

```
Run
├── Phase (high-level stage)
│   ├── Status: pending | active | completed | skipped | error
│   ├── Tasks (low-level activities)
│   │   ├── Status: pending | running | completed | failed | skipped
│   │   └── Progress: { current, total }
│   └── Iteration Count (for loops)
└── Overall Progress
```

### Phases

| Phase | Icon | Description | Has Sub-Progress? |
|-------|------|-------------|-------------------|
| Init | Globe | Starting browser | No |
| Discovery | Search | Finding pages | No |
| Planning | Document | Creating tests | No |
| Execution | Play | Running tests | Yes (steps) |
| Traversal | Layers | Testing pages | Yes (pages) |
| Evaluation | Chart | Scoring results | No |

### Progress Calculation

Progress is always bounded using this formula:

```typescript
function calculateProgress(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (current / total) * 100));
}
```

The store also enforces monotonic totals (total can only increase) and clamped current values.

## Component Architecture

```
ProgressSection
├── Header (title, total elapsed time)
├── PhaseTimelineV2
│   ├── Progress track (visual connector)
│   ├── PhaseIndicator × 6
│   │   ├── Node (icon/spinner/checkmark)
│   │   ├── Progress ring (if applicable)
│   │   ├── Labels (name, description)
│   │   └── Iteration badge (if > 1)
│   └── ActivePhaseDetail
│       ├── Phase info
│       ├── Current activity
│       ├── Phase elapsed time
│       └── Progress bar (if applicable)
├── SitemapTree
└── LiveLog
```

## Visual States

### Phase States

| State | Node Style | Icon | Animation |
|-------|-----------|------|-----------|
| Pending | Muted bg, muted border | Phase icon | None |
| Active | White bg, black border | Spinner | Pulse ring |
| Completed | Black bg, black border | Checkmark | None |
| Error | Red tint bg, red border | Alert icon | None |
| Skipped | Faded muted | Phase icon | None |

### Active Phase Indicators

1. **Spinning loader** - Replaces the phase icon
2. **Pulse ring** - Subtle animation around the node
3. **Progress ring** - SVG circle showing completion %
4. **Bold label** - Font weight increases
5. **Activity text** - Shows current action

## Timing Display

Two timer types are clearly labeled:

1. **Total Time** (header) - Elapsed since test start
2. **Phase Time** (detail panel) - Elapsed since phase start

Both use the label text to clarify scope.

## Accessibility

### ARIA Attributes

- `role="list"` on phase container
- `role="listitem"` on each phase
- `aria-current="step"` on active phase
- `aria-label` with full status description
- `aria-live="polite"` for announcements
- `role="progressbar"` with `aria-valuenow/min/max`

### Color Independence

Status is conveyed through:
- Icon changes (spinner vs checkmark vs alert)
- Text labels ("In Progress", "Completed")
- Border styles (solid, dashed)
- Shape differences (rings, badges)

### Screen Reader Announcements

```typescript
function getStatusAnnouncement(phase, state): string {
  switch (state.status) {
    case "pending": return `${phase.label} phase: Not started`;
    case "active": return `${phase.label} phase: In progress. ${state.currentActivity}`;
    case "completed": return `${phase.label} phase: Completed`;
    // ...
  }
}
```

## Animation Recommendations

### Phase Transitions

```css
/* Node state changes */
.phase-node {
  transition: all 0.3s ease-out;
}

/* Progress track fill */
.progress-track-fill {
  transition: width 0.5s ease-out;
}

/* Active spinner */
.active-spinner {
  animation: spin 1s linear infinite;
}

/* Pulse ring */
.pulse-ring {
  animation: pulse 2s ease-in-out infinite;
}
```

### Progress Ring Animation

The SVG progress ring uses `stroke-dashoffset` animation:

```css
.progress-ring {
  transition: stroke-dashoffset 0.3s ease-out;
  transform: rotate(-90deg);
  transform-origin: center;
}
```

### Microinteractions

1. **Phase completion** - Brief scale bump (1.0 → 1.1 → 1.0)
2. **Error state** - Subtle shake animation
3. **Progress increment** - Smooth value interpolation
4. **Iteration badge** - Pop-in animation

## Iterative Workflow Support

### Iteration Tracking

Each phase tracks `iterationCount`:

```typescript
interface PhaseState {
  // ...
  iterationCount: number; // Starts at 0, increments on each entry
}
```

When a phase is revisited (e.g., re-evaluation after fixes):
1. `iterationCount` increments
2. Badge shows iteration number
3. Progress resets for that phase
4. Completed phases remain completed

### Phase Re-entry

```typescript
setPhaseActive: (phase) => set((state) => ({
  phases: {
    ...state.phases,
    [phase]: {
      status: "active",
      startedAt: Date.now(),
      iterationCount: state.phases[phase].iterationCount + 1,
      tasks: [],
    },
  },
})),
```

## Files Changed

- `frontend/src/lib/progress-types.ts` - New state model and helpers
- `frontend/src/components/progress/PhaseIndicator.tsx` - New phase node component
- `frontend/src/components/progress/PhaseTimelineV2.tsx` - New timeline component
- `frontend/src/components/progress/ActivePhaseDetail.tsx` - New detail panel
- `frontend/src/components/progress/ProgressSection.tsx` - Updated to use V2
- `frontend/src/store/useAppStore.ts` - Added bounds checking
- `frontend/src/hooks/useSSE.ts` - Added page event handlers
- `frontend/src/lib/types.ts` - Added page event types
