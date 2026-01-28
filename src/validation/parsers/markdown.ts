/**
 * Markdown document parser
 */

import { promises as fs } from "fs";
import type {
  DocumentParser,
  ParsedDocument,
  DocumentSection,
  DocumentMetadata,
} from "./types.js";

/**
 * Parse markdown content into sections based on headings
 */
function parseMarkdownSections(content: string): DocumentSection[] {
  const lines = content.split("\n");
  const sections: DocumentSection[] = [];

  let currentSection: DocumentSection | null = null;
  let contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1; // 1-indexed

    // Check for markdown heading (# to ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section if exists
      if (currentSection) {
        currentSection.content = contentLines.join("\n").trim();
        currentSection.endLine = lineNumber - 1;
        sections.push(currentSection);
      }

      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();

      currentSection = {
        heading,
        content: "",
        startLine: lineNumber,
        endLine: lineNumber,
        level,
      };
      contentLines = [];
    } else if (currentSection) {
      contentLines.push(line);
    } else {
      // Content before first heading - create implicit section
      if (line.trim()) {
        if (!currentSection) {
          currentSection = {
            heading: "Introduction",
            content: "",
            startLine: 1,
            endLine: lineNumber,
            level: 0,
          };
          contentLines = [];
        }
        contentLines.push(line);
      }
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = contentLines.join("\n").trim();
    currentSection.endLine = lines.length;
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Extract document title from markdown
 */
function extractTitle(sections: DocumentSection[]): string | undefined {
  // Look for level 1 heading
  const h1 = sections.find((s) => s.level === 1);
  return h1?.heading;
}

/**
 * Markdown parser implementation
 */
export class MarkdownParser implements DocumentParser {
  format = "markdown" as const;

  async parseFile(filePath: string): Promise<ParsedDocument> {
    const content = await fs.readFile(filePath, "utf-8");
    return this.parseContent(content, filePath);
  }

  parseContent(content: string, filePath: string): ParsedDocument {
    const sections = parseMarkdownSections(content);
    const lines = content.split("\n");

    const metadata: DocumentMetadata = {
      title: extractTitle(sections),
      lineCount: lines.length,
      characterCount: content.length,
      sectionCount: sections.length,
    };

    return {
      filePath,
      format: "markdown",
      rawContent: content,
      sections,
      metadata,
    };
  }
}

/**
 * Create a markdown parser instance
 */
export function createMarkdownParser(): MarkdownParser {
  return new MarkdownParser();
}
