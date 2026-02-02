export function shouldScreenshotBefore(stepType: string, captureBeforeAfter: boolean): boolean {
  if (!captureBeforeAfter) return false;
  return ["click", "fill", "press"].includes(stepType);
}

export function shouldScreenshotAfter(stepType: string, captureBeforeAfter: boolean): boolean {
  if (captureBeforeAfter) {
    return ["click", "open", "fill", "press"].includes(stepType);
  }
  return ["click", "open"].includes(stepType);
}

export function shouldSnapshotAfter(stepType: string): boolean {
  return ["click", "fill", "press"].includes(stepType);
}
