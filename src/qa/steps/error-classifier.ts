/**
 * Check if error should block the entire test run
 * Only browser crashes/disconnects should block - timeouts should skip and continue
 */
export function isBlockingError(error: string): boolean {
  const blockingPatterns = [
    "crashed",
    "disconnected",
    "target closed",
    "session closed",
    "browser has been closed",
    "protocol error",
  ];

  const lowerError = error.toLowerCase();
  return blockingPatterns.some((pattern) => lowerError.includes(pattern));
}

/**
 * Check if error is a timeout that should skip the current action/page
 * These errors should NOT block the entire run
 */
export function isSkippableError(error: string): boolean {
  const skippablePatterns = [
    "timeout",
    "navigation failed",
    "net::",
    "err_connection",
    "element not found",
    "no element matches",
  ];

  const lowerError = error.toLowerCase();
  return skippablePatterns.some((pattern) => lowerError.includes(pattern));
}

export interface MultipleMatchError {
  matched: boolean;
  count?: number;
  selector?: string;
}

// Check if error is due to multiple elements matching
export function isMultipleMatchError(error: string): MultipleMatchError {
  // Strip ANSI escape codes first
  const cleanError = error.replace(/\x1b\[[0-9;]*m/g, "").replace(/\[[\d;]*m/g, "");

  // Pattern: Selector "XXX" matched N elements
  const match = cleanError.match(/Selector "([^"]+)" matched (\d+) elements/);
  if (match) {
    return { matched: true, selector: match[1], count: parseInt(match[2], 10) };
  }
  return { matched: false };
}
