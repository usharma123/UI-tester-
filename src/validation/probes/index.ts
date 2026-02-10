import { emit } from "../../core/events/emit.js";
import type { ValidationProbeContext, ValidationProbeResult } from "./types.js";
import { runKeyboardProbe } from "./keyboard.js";
import { runResponsiveProbe } from "./responsive.js";
import { runPerformanceProbe } from "./performance.js";
import { runAccessibilityProbe } from "./accessibility.js";

export async function runValidationProbes(context: ValidationProbeContext): Promise<ValidationProbeResult[]> {
  if (!context.config.enableProbes) {
    emit(context.onProgress, {
      type: "log",
      message: "Validation probes disabled by configuration.",
      level: "info",
    });
    return [];
  }

  emit(context.onProgress, {
    type: "log",
    message: "Running deterministic validation probes...",
    level: "info",
  });

  const probes = [runKeyboardProbe, runResponsiveProbe, runPerformanceProbe, runAccessibilityProbe];
  const results: ValidationProbeResult[] = [];

  for (const probe of probes) {
    const result = await probe(context);
    results.push(result);
    emit(context.onProgress, {
      type: "log",
      message: `  Probe ${result.kind}: ${result.status} — ${result.summary}`,
      level: result.status === "pass" ? "info" : result.status === "partial" ? "warn" : "error",
    });
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail" || r.status === "error").length;
  emit(context.onProgress, {
    type: "log",
    message: `Probe execution complete: ${passed} passed, ${failed} failed/error, ${results.length} total.`,
    level: failed > 0 ? "warn" : "info",
  });

  return results;
}

export type { ValidationProbeContext, ValidationProbeResult } from "./types.js";
