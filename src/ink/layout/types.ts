export type ViewDensity = "rich" | "standard" | "compact" | "minimal";

export interface ViewportSectionHeights {
  requirements: number;
  rubric: number;
  sitemap: number;
  scenarios: number;
  tasks: number;
  logs: number;
}

export interface ViewportSectionVisibility {
  requirements: boolean;
  rubric: boolean;
  sitemap: boolean;
  scenarios: boolean;
  tasks: boolean;
}

export interface ViewportBudget {
  rows: number;
  columns: number;
  density: ViewDensity;
  runningHeight: number;
  sectionHeights: ViewportSectionHeights;
  visible: ViewportSectionVisibility;
  showKeyHints: boolean;
}
