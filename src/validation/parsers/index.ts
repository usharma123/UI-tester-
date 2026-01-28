/**
 * Document parser factory
 */

import { extname } from "path";
import type { DocumentParser, DocumentFormat, ParsedDocument } from "./types.js";
import { MarkdownParser } from "./markdown.js";

export * from "./types.js";
export { MarkdownParser } from "./markdown.js";

/**
 * Map of file extensions to document formats
 */
const extensionToFormat: Record<string, DocumentFormat> = {
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "plain",
};

/**
 * Get document format from file extension
 */
export function getFormatFromExtension(filePath: string): DocumentFormat {
  const ext = extname(filePath).toLowerCase();
  return extensionToFormat[ext] || "plain";
}

/**
 * Create a parser for the given format
 */
export function createParser(format: DocumentFormat): DocumentParser {
  switch (format) {
    case "markdown":
      return new MarkdownParser();
    case "plain":
      // For plain text, use markdown parser (it handles non-heading content)
      return new MarkdownParser();
    default:
      throw new Error(`Unsupported document format: ${format}`);
  }
}

/**
 * Create a parser for the given file path (auto-detects format)
 */
export function createParserForFile(filePath: string): DocumentParser {
  const format = getFormatFromExtension(filePath);
  return createParser(format);
}

/**
 * Parse a document file (convenience function)
 */
export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const parser = createParserForFile(filePath);
  return parser.parseFile(filePath);
}
