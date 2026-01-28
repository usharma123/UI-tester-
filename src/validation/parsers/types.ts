/**
 * Document parser interface and types
 */

/**
 * A section extracted from a document
 */
export interface DocumentSection {
  /** Section heading or identifier */
  heading: string;
  /** Full text content of the section */
  content: string;
  /** Line number where section starts (1-indexed) */
  startLine: number;
  /** Line number where section ends (1-indexed) */
  endLine: number;
  /** Nesting level (1 = top level, 2 = subsection, etc.) */
  level: number;
}

/**
 * Result of parsing a document
 */
export interface ParsedDocument {
  /** Original file path */
  filePath: string;
  /** Document format */
  format: DocumentFormat;
  /** Raw content of the document */
  rawContent: string;
  /** Extracted sections */
  sections: DocumentSection[];
  /** Document metadata */
  metadata: DocumentMetadata;
}

/**
 * Supported document formats
 */
export type DocumentFormat = "markdown" | "plain";

/**
 * Document metadata
 */
export interface DocumentMetadata {
  /** Document title if found */
  title?: string;
  /** Total line count */
  lineCount: number;
  /** Total character count */
  characterCount: number;
  /** Number of sections found */
  sectionCount: number;
}

/**
 * Document parser interface
 */
export interface DocumentParser {
  /** Supported format */
  format: DocumentFormat;
  /** Parse a document from file path */
  parseFile(filePath: string): Promise<ParsedDocument>;
  /** Parse a document from string content */
  parseContent(content: string, filePath: string): ParsedDocument;
}
