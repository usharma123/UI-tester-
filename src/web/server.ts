import { join } from "node:path";
import { loadConfig } from "../config.js";
import { runQAStreaming } from "../qa/run-streaming.js";
import type { SSEEvent, StartRunRequest, StartRunResponse } from "./types.js";
import * as convex from "./convex.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const PUBLIC_DIR = join(import.meta.dir, "../../public");

// Store for active SSE connections
const activeConnections = new Map<string, ReadableStreamDefaultController<Uint8Array>>();

// Store for run events (for late joiners)
const runEvents = new Map<string, SSEEvent[]>();

function formatSSEMessage(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

async function serveStaticFile(path: string): Promise<Response> {
  const filePath = join(PUBLIC_DIR, path === "/" ? "index.html" : path);

  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      return new Response("Not Found", { status: 404 });
    }

    const contentType = getContentType(filePath);
    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  } catch (error) {
    return new Response("Internal Server Error", { status: 500 });
  }
}

function getContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    ico: "image/x-icon",
  };
  return types[ext || ""] || "application/octet-stream";
}

// Generate a simple run ID if Convex is not configured
function generateRunId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

async function handleStartRun(request: Request): Promise<Response> {
  try {
    const body: StartRunRequest = await request.json();

    if (!body.url) {
      return Response.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      return Response.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const goals = body.goals || "homepage UX + primary CTA + form validation + keyboard";

    // Create run in Convex or generate local ID
    let runId: string;
    if (convex.isConvexConfigured()) {
      runId = await convex.createRun(body.url, goals);
    } else {
      runId = generateRunId();
    }

    // Initialize events array for this run
    runEvents.set(runId, []);

    // Start the QA run in the background
    const config = loadConfig({ goals });

    // Run async - don't await
    runQAStreaming({
      config,
      url: body.url,
      goals,
      convexRunId: runId,
      onProgress: (event) => {
        // Store event for late joiners
        const events = runEvents.get(runId);
        if (events) {
          events.push(event);
        }

        // Send to connected clients
        const controller = activeConnections.get(runId);
        if (controller) {
          try {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(formatSSEMessage(event)));
          } catch (error) {
            // Connection closed
            activeConnections.delete(runId);
          }
        }
      },
    }).catch((error) => {
      console.error(`Run ${runId} failed:`, error);
    });

    const response: StartRunResponse = {
      runId,
      status: "started",
    };

    return Response.json(response);
  } catch (error) {
    console.error("Failed to start run:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to start run" },
      { status: 500 }
    );
  }
}

// Store for heartbeat intervals
const heartbeatIntervals = new Map<string, Timer>();

function handleSSEStream(runId: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Store controller for this run
      activeConnections.set(runId, controller);

      // Send connected event
      const connectedEvent: SSEEvent = {
        type: "connected",
        runId,
        timestamp: Date.now(),
      };
      controller.enqueue(encoder.encode(formatSSEMessage(connectedEvent)));

      // Send any existing events for late joiners
      const existingEvents = runEvents.get(runId);
      if (existingEvents) {
        for (const event of existingEvents) {
          controller.enqueue(encoder.encode(formatSSEMessage(event)));
        }
      }
      
      // Start heartbeat to keep connection alive (every 15 seconds)
      const heartbeat = setInterval(() => {
        try {
          // Send SSE comment as heartbeat (won't trigger client event handlers)
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Connection closed, clean up
          clearInterval(heartbeat);
          heartbeatIntervals.delete(runId);
        }
      }, 15000);
      
      heartbeatIntervals.set(runId, heartbeat);
    },
    cancel() {
      // Clean up heartbeat
      const heartbeat = heartbeatIntervals.get(runId);
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeatIntervals.delete(runId);
      }
      activeConnections.delete(runId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function handleGetRuns(): Promise<Response> {
  if (!convex.isConvexConfigured()) {
    return Response.json({ runs: [] });
  }

  try {
    const runs = await convex.listRuns(10);
    return Response.json({ runs });
  } catch (error) {
    console.error("Failed to list runs:", error);
    return Response.json({ runs: [], error: "Failed to list runs" });
  }
}

async function handleGetRun(runId: string): Promise<Response> {
  if (!convex.isConvexConfigured()) {
    return Response.json({ error: "Convex not configured" }, { status: 503 });
  }

  try {
    const run = await convex.getRun(runId);
    if (!run) {
      return Response.json({ error: "Run not found" }, { status: 404 });
    }
    return Response.json(run);
  } catch (error) {
    console.error("Failed to get run:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get run" },
      { status: 500 }
    );
  }
}

const server = Bun.serve({
  port: PORT,
  // Increase idle timeout for long-running SSE connections (5 minutes)
  idleTimeout: 300,
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for API routes
    if (path.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
    }

    // API Routes
    if (path === "/api/run" && request.method === "POST") {
      return handleStartRun(request);
    }

    // SSE stream for run events
    const sseMatch = path.match(/^\/api\/run\/([^/]+)\/events$/);
    if (sseMatch && request.method === "GET") {
      return handleSSEStream(sseMatch[1]);
    }

    // Get all runs
    if (path === "/api/runs" && request.method === "GET") {
      return handleGetRuns();
    }

    // Get specific run
    const runMatch = path.match(/^\/api\/runs\/([^/]+)$/);
    if (runMatch && request.method === "GET") {
      return handleGetRun(runMatch[1]);
    }

    // Health check
    if (path === "/api/health") {
      return Response.json({
        status: "ok",
        convexConfigured: convex.isConvexConfigured(),
      });
    }

    // Static files
    return serveStaticFile(path);
  },
});

console.log(`UI QA Web Server running at http://localhost:${PORT}`);
console.log(`Convex configured: ${convex.isConvexConfigured()}`);
