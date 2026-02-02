import type { ProgressCallback } from "../../qa/progress-types.js";
import type { ParsedDocument } from "../parsers/types.js";
import { emit, emitValidationPhaseStart, emitValidationPhaseComplete } from "../../core/events/emit.js";
import { parseDocument } from "../parsers/index.js";

export interface ParsingPhaseOptions {
  specFile: string;
  onProgress: ProgressCallback;
}

export async function runParsingPhase(options: ParsingPhaseOptions): Promise<ParsedDocument> {
  const { specFile, onProgress } = options;

  emitValidationPhaseStart(onProgress, "parsing");
  emit(onProgress, {
    type: "log",
    message: `Parsing specification: ${specFile}`,
    level: "info",
  });

  const document = await parseDocument(specFile);

  emit(onProgress, {
    type: "log",
    message: `Parsed ${document.sections.length} sections from ${document.metadata.lineCount} lines`,
    level: "info",
  });

  emitValidationPhaseComplete(onProgress, "parsing");

  return document;
}
