// Make a selector more specific by targeting first element
export function makeFirstSelector(selector: string): string {
  // For text selectors, use first match
  if (selector.startsWith("text=") || selector.startsWith("text:")) {
    return `${selector} >> nth=0`;
  }
  // For link selectors
  if (selector.startsWith("a:") || selector.includes(":has-text")) {
    return `${selector} >> nth=0`;
  }
  // For CSS selectors
  if (selector.includes(" ") || selector.includes(">")) {
    return `${selector}:first-of-type`;
  }
  // Default: add nth=0
  return `${selector} >> nth=0`;
}
