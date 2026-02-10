import { useMemo } from "react";
import type { ViewDensity, ViewportBudget } from "./types.js";

function getDensity(rows: number): ViewDensity {
  if (rows >= 40) return "rich";
  if (rows >= 30) return "standard";
  if (rows >= 24) return "compact";
  return "minimal";
}

/**
 * Compute a viewport budget with stable section heights for each density.
 *
 * Heights are constant for a given terminal size. The running-view container
 * uses height={runningHeight} + overflowY="hidden" to guarantee a stable
 * frame height regardless of which sections have content.
 */
export function computeViewportBudget(rows: number, columns: number): ViewportBudget {
  const safeRows = Math.max(10, rows || 24);
  const safeColumns = Math.max(40, columns || 80);
  const density = getDensity(safeRows);
  const runningHeight = Math.max(14, safeRows - 6);

  if (density === "rich") {
    return {
      rows: safeRows,
      columns: safeColumns,
      density,
      runningHeight,
      sectionHeights: {
        requirements: 6,
        rubric: 5,
        sitemap: 6,
        scenarios: 7,
        tasks: 5,
        logs: Math.max(6, runningHeight - 26),
      },
      visible: {
        requirements: true,
        rubric: true,
        sitemap: true,
        scenarios: true,
        tasks: true,
      },
      showKeyHints: true,
    };
  }

  if (density === "standard") {
    return {
      rows: safeRows,
      columns: safeColumns,
      density,
      runningHeight,
      sectionHeights: {
        requirements: 5,
        rubric: 4,
        sitemap: 5,
        scenarios: 6,
        tasks: 4,
        logs: Math.max(5, runningHeight - 22),
      },
      visible: {
        requirements: true,
        rubric: true,
        sitemap: true,
        scenarios: true,
        tasks: true,
      },
      showKeyHints: true,
    };
  }

  if (density === "compact") {
    return {
      rows: safeRows,
      columns: safeColumns,
      density,
      runningHeight,
      sectionHeights: {
        requirements: 4,
        rubric: 3,
        sitemap: 4,
        scenarios: 4,
        tasks: 3,
        logs: Math.max(4, runningHeight - 16),
      },
      visible: {
        requirements: true,
        rubric: true,
        sitemap: true,
        scenarios: true,
        tasks: true,
      },
      showKeyHints: true,
    };
  }

  // minimal
  return {
    rows: safeRows,
    columns: safeColumns,
    density,
    runningHeight,
    sectionHeights: {
      requirements: 0,
      rubric: 0,
      sitemap: 0,
      scenarios: 0,
      tasks: 0,
      logs: Math.max(3, runningHeight - 7),
    },
    visible: {
      requirements: false,
      rubric: false,
      sitemap: false,
      scenarios: false,
      tasks: false,
    },
    showKeyHints: false,
  };
}

export function useViewportBudget(rows: number, columns: number): ViewportBudget {
  return useMemo(() => computeViewportBudget(rows, columns), [rows, columns]);
}
