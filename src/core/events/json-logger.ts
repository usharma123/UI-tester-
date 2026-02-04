import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SSEEvent } from "../../qa/progress-types.js";
import * as localStorage from "../../storage/local.js";

export interface JsonEventLoggerOptions {
  runId: string;
  filePath?: string;
}

export function createJsonEventLogger(options: JsonEventLoggerOptions): (event: SSEEvent) => void {
  const filePath =
    options.filePath ??
    join(localStorage.getLocalStorageDir(), options.runId, "events.jsonl");

  let ensured = false;
  let ensurePromise: Promise<void> | null = null;

  const ensureDir = async () => {
    if (ensured) return;
    if (!ensurePromise) {
      ensurePromise = mkdir(dirname(filePath), { recursive: true }).then(() => {
        ensured = true;
      });
    }
    await ensurePromise;
  };

  void ensureDir();

  return (event: SSEEvent) => {
    const payload = { ...event, runId: options.runId };
    void ensureDir()
      .then(() => appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf-8"))
      .catch(() => {});
  };
}
