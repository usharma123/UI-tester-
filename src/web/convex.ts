import { readFile } from "node:fs/promises";
import type { Report, Evidence } from "../qa/types";

// Convex HTTP client wrapper for server-side usage
// Uses the Convex HTTP API for mutations and queries

const CONVEX_URL = process.env.CONVEX_URL || "";

interface ConvexResponse<T> {
  status: "success" | "error";
  value?: T;
  errorMessage?: string;
}

async function callMutation<T>(
  functionPath: string,
  args: Record<string, unknown>,
  authToken?: string
): Promise<T> {
  if (!CONVEX_URL) {
    throw new Error("CONVEX_URL environment variable is not set");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      path: functionPath,
      args,
    }),
  });

  if (!response.ok) {
    throw new Error(`Convex mutation failed: ${response.statusText}`);
  }

  const result: ConvexResponse<T> = await response.json();

  if (result.status === "error") {
    throw new Error(result.errorMessage || "Convex mutation failed");
  }

  return result.value as T;
}

async function callQuery<T>(
  functionPath: string,
  args: Record<string, unknown>,
  authToken?: string
): Promise<T> {
  if (!CONVEX_URL) {
    throw new Error("CONVEX_URL environment variable is not set");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      path: functionPath,
      args,
    }),
  });

  if (!response.ok) {
    throw new Error(`Convex query failed: ${response.statusText}`);
  }

  const result: ConvexResponse<T> = await response.json();

  if (result.status === "error") {
    throw new Error(result.errorMessage || "Convex query failed");
  }

  return result.value as T;
}

// Run management functions
export async function createRun(url: string, goals: string, authToken?: string): Promise<string> {
  return callMutation<string>("runs:createRun", { url, goals }, authToken);
}

export async function updateRunStatus(
  runId: string,
  status: "running" | "completed" | "failed"
): Promise<void> {
  await callMutation("runs:updateRunStatus", { runId, status });
}

export async function completeRun(
  runId: string,
  score: number,
  summary: string,
  report: Report,
  evidence: Evidence
): Promise<void> {
  await callMutation("runs:completeRun", {
    runId,
    score,
    summary,
    report,
    evidence,
  });
}

export async function failRun(runId: string, error: string): Promise<void> {
  await callMutation("runs:failRun", { runId, error });
}

export interface RunWithScreenshots {
  _id: string;
  url: string;
  goals: string;
  status: "running" | "completed" | "failed";
  score?: number;
  summary?: string;
  report?: Report;
  evidence?: Evidence;
  error?: string;
  startedAt: number;
  completedAt?: number;
  screenshots: Array<{
    _id: string;
    storageId: string;
    stepIndex: number;
    label: string;
    url: string | null;
    createdAt: number;
  }>;
}

export async function getRun(runId: string): Promise<RunWithScreenshots | null> {
  return callQuery<RunWithScreenshots | null>("runs:getRun", { runId });
}

export interface RunSummary {
  _id: string;
  url: string;
  goals: string;
  status: "running" | "completed" | "failed";
  score?: number;
  summary?: string;
  startedAt: number;
  completedAt?: number;
}

export async function listRuns(limit?: number, authToken?: string): Promise<RunSummary[]> {
  return callQuery<RunSummary[]>("runs:listRuns", { limit: limit ?? 10 }, authToken);
}

// Screenshot management functions
export async function generateUploadUrl(): Promise<string> {
  return callMutation<string>("screenshots:generateUploadUrl", {});
}

export async function saveScreenshot(
  runId: string,
  storageId: string,
  stepIndex: number,
  label: string
): Promise<string> {
  return callMutation<string>("screenshots:saveScreenshot", {
    runId,
    storageId,
    stepIndex,
    label,
  });
}

export interface ScreenshotWithUrl {
  _id: string;
  runId: string;
  storageId: string;
  stepIndex: number;
  label: string;
  url: string | null;
  createdAt: number;
}

export async function getScreenshotsForRun(
  runId: string
): Promise<ScreenshotWithUrl[]> {
  return callQuery<ScreenshotWithUrl[]>("screenshots:getScreenshotsForRun", {
    runId,
  });
}

// Upload a screenshot file to Convex storage
export async function uploadScreenshot(
  filePath: string,
  runId: string,
  stepIndex: number,
  label: string
): Promise<{ storageId: string; url: string }> {
  // Read the file
  const buffer = await readFile(filePath);

  // Get upload URL
  const uploadUrl = await generateUploadUrl();

  // Upload the file
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
    },
    body: buffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload screenshot: ${uploadResponse.statusText}`);
  }

  const { storageId } = await uploadResponse.json();

  // Save screenshot metadata
  await saveScreenshot(runId, storageId, stepIndex, label);

  // Get the URL for the uploaded file
  const url = await callQuery<string | null>("runs:getScreenshotUrl", {
    storageId,
  });

  return { storageId, url: url || "" };
}

// Check if Convex is configured
export function isConvexConfigured(): boolean {
  return !!CONVEX_URL;
}

// Call a query with auth token
export async function callQueryWithAuth<T>(
  functionPath: string,
  args: Record<string, unknown>,
  authToken: string
): Promise<T> {
  return callQuery<T>(functionPath, args, authToken);
}

// Call a mutation with auth token
export async function callMutationWithAuth<T>(
  functionPath: string,
  args: Record<string, unknown>,
  authToken: string
): Promise<T> {
  return callMutation<T>(functionPath, args, authToken);
}

// Call an internal mutation (for webhooks - no auth needed but requires internal API key)
// Note: For Convex, internal mutations are called via the HTTP API without auth
// The function itself must be marked as internalMutation in Convex
export async function callInternalMutation<T>(
  functionPath: string,
  args: Record<string, unknown>
): Promise<T> {
  if (!CONVEX_URL) {
    throw new Error("CONVEX_URL environment variable is not set");
  }

  // Internal mutations use the same endpoint but without auth header
  // Convex validates based on the mutation being internal
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: functionPath,
      args,
    }),
  });

  if (!response.ok) {
    throw new Error(`Convex internal mutation failed: ${response.statusText}`);
  }

  const result: ConvexResponse<T> = await response.json();

  if (result.status === "error") {
    throw new Error(result.errorMessage || "Convex internal mutation failed");
  }

  return result.value as T;
}
