// =============================================================================
// Selector sanitization: clean up LLM-generated CSS selectors before execution
// =============================================================================

/**
 * Sanitize an LLM-generated CSS selector to remove patterns that cause false failures.
 *
 * Handles:
 * - Empty attribute selectors: [name=''], [id=''], [aria-label='']
 * - :first-of-type after attribute brackets (overly specific)
 * - :has(option[value='...'][selected]) pseudo-selectors
 * - Trailing whitespace
 *
 * @throws {Error} if the sanitized result is empty
 */
export function sanitizeSelector(selector: string): string {
  let result = selector;
  const original = selector;

  // Remove clearly invalid empty attribute selectors.
  result = result.replace(/\[(name|id|aria-label)\s*=\s*(['"])\2\]/g, "");

  // Only relax strict pseudo-selectors if the selector was already malformed.
  const hadEmptyAttrs = original !== result;
  if (hadEmptyAttrs) {
    // Remove :first-of-type only when attached to broken selectors.
    result = result.replace(/\]\s*:first-of-type/g, "]");
    result = result.replace(/:first-of-type\b/g, "");

    // Strip select option-state pseudo selector that often appears in invalid generated CSS.
    result = result.replace(/:has\(option\[value=['"][^'"]*['"]\]\[selected\]\)/g, "");
  }

  // Clean trailing/leading whitespace
  result = result.trim();

  if (!result) {
    throw new Error(
      `Selector sanitization produced empty result from: "${selector}"`
    );
  }

  return result;
}
