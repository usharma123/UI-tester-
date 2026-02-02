import type { ProgressCallback, SSEEvent, QAPhase } from "../../qa/progress-types.js";
import type { ValidationPhase } from "../../validation/types.js";

// Helper to emit events with timestamp
export function emit<T extends { type: string }>(callback: ProgressCallback, event: T): void {
  callback({ ...event, timestamp: Date.now() } as unknown as SSEEvent);
}

// Helper to emit QA phase events
export function emitPhaseStart(callback: ProgressCallback, phase: QAPhase): void {
  emit(callback, { type: "phase_start", phase });
}

export function emitPhaseComplete(callback: ProgressCallback, phase: QAPhase): void {
  emit(callback, { type: "phase_complete", phase });
}

// Helper to emit validation phase events
export function emitValidationPhaseStart(callback: ProgressCallback, phase: ValidationPhase): void {
  emit(callback, { type: "validation_phase_start", phase });
}

export function emitValidationPhaseComplete(callback: ProgressCallback, phase: ValidationPhase): void {
  emit(callback, { type: "validation_phase_complete", phase });
}
