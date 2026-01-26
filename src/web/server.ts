import express, { type Request, type Response } from "express";
import cors from "cors";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";
import { loadConfig } from "../config.js";
import { runQAStreaming } from "../qa/run-streaming.js";
import type { SSEEvent, StartRunRequest, StartRunResponse } from "./types.js";
import * as convex from "./convex.js";
import {
  stripe,
  isStripeConfigured,
  PRICING_TIERS,
  getPublicPricingInfo,
  getTierByPriceId,
  type PricingTier,
} from "../utils/stripe.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || "3000", 10);
const PUBLIC_DIR = join(__dirname, "../../dist");

// Store for active SSE connections
const activeConnections = new Map<string, Response>();

// Store for run events (for late joiners)
const runEvents = new Map<string, SSEEvent[]>();

// Store for heartbeat intervals
const heartbeatIntervals = new Map<string, NodeJS.Timeout>();

function formatSSEMessage(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
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

const app = express();

// Middleware
app.use(cors());

// Stripe webhook needs raw body - must be before express.json()
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    if (!isStripeConfigured() || !stripe) {
      res.status(503).json({ error: "Stripe not configured" });
      return;
    }

    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      res.status(400).json({ error: "Missing signature or webhook secret" });
      return;
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      res.status(400).json({ error: "Webhook signature verification failed" });
      return;
    }

    console.log(`Stripe webhook received: ${event.type}`);

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          console.log(`Checkout completed: ${session.id}`);

          // Complete the purchase in Convex
          await convex.callInternalMutation("purchases:completePurchase", {
            stripeSessionId: session.id,
            stripePaymentIntentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id,
          });
          break;
        }

        case "checkout.session.expired": {
          const session = event.data.object;
          console.log(`Checkout expired: ${session.id}`);

          // Mark the purchase as failed
          await convex.callInternalMutation("purchases:markPurchaseFailed", {
            stripeSessionId: session.id,
          });
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object;
          console.log(`Payment failed: ${paymentIntent.id}`);
          // Payment failures are usually handled via checkout.session.expired
          break;
        }

        case "charge.refunded": {
          const charge = event.data.object;
          console.log(`Charge refunded: ${charge.id}`);

          if (charge.payment_intent) {
            await convex.callInternalMutation("purchases:markPurchaseRefunded", {
              stripePaymentIntentId:
                typeof charge.payment_intent === "string"
                  ? charge.payment_intent
                  : charge.payment_intent.id,
            });
          }
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Error processing webhook:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

app.use(express.json());

// API Routes

// Start a new QA run
app.post("/api/run", async (req: Request, res: Response) => {
  try {
    const body: StartRunRequest = req.body;
    const authToken = req.headers.authorization?.replace("Bearer ", "");

    if (!body.url) {
      res.status(400).json({ error: "URL is required" });
      return;
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      res.status(400).json({ error: "Invalid URL format" });
      return;
    }

    const goals = body.goals || "homepage UX + primary CTA + form validation + keyboard";

    // Create run in Convex or generate local ID
    let runId: string;
    if (convex.isConvexConfigured()) {
      try {
        runId = await convex.createRun(body.url, goals, authToken);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (errorMessage.includes("Authentication required")) {
          res.status(401).json({ error: "Authentication required" });
          return;
        }
        if (errorMessage.includes("No remaining runs")) {
          res.status(403).json({ error: "No remaining runs" });
          return;
        }
        throw error;
      }
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
        const clientRes = activeConnections.get(runId);
        if (clientRes) {
          try {
            clientRes.write(formatSSEMessage(event));
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

    res.json(response);
  } catch (error) {
    console.error("Failed to start run:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to start run",
    });
  }
});

// SSE stream for run events
app.get("/api/run/:runId/events", (req: Request, res: Response) => {
  const { runId } = req.params;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Store connection for this run
  activeConnections.set(runId, res);

  // Send connected event
  const connectedEvent: SSEEvent = {
    type: "connected",
    runId,
    timestamp: Date.now(),
  };
  res.write(formatSSEMessage(connectedEvent));

  // Send any existing events for late joiners
  const existingEvents = runEvents.get(runId);
  if (existingEvents) {
    for (const event of existingEvents) {
      res.write(formatSSEMessage(event));
    }
  }

  // Start heartbeat to keep connection alive (every 15 seconds)
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      // Connection closed, clean up
      clearInterval(heartbeat);
      heartbeatIntervals.delete(runId);
    }
  }, 15000);

  heartbeatIntervals.set(runId, heartbeat);

  // Clean up on close
  req.on("close", () => {
    const hb = heartbeatIntervals.get(runId);
    if (hb) {
      clearInterval(hb);
      heartbeatIntervals.delete(runId);
    }
    activeConnections.delete(runId);
  });
});

// Get all runs
app.get("/api/runs", async (req: Request, res: Response) => {
  if (!convex.isConvexConfigured()) {
    res.json({ runs: [] });
    return;
  }

  const authToken = req.headers.authorization?.replace("Bearer ", "");

  try {
    const runs = await convex.listRuns(10, authToken);
    res.json({ runs });
  } catch (error) {
    console.error("Failed to list runs:", error);
    res.json({ runs: [], error: "Failed to list runs" });
  }
});

// Get specific run
app.get("/api/runs/:runId", async (req: Request, res: Response) => {
  if (!convex.isConvexConfigured()) {
    res.status(503).json({ error: "Convex not configured" });
    return;
  }

  try {
    const run = await convex.getRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json(run);
  } catch (error) {
    console.error("Failed to get run:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get run",
    });
  }
});

// Get pricing tiers (public)
app.get("/api/pricing", (_req: Request, res: Response) => {
  res.json({
    tiers: getPublicPricingInfo(),
    stripeConfigured: isStripeConfigured(),
  });
});

// Create checkout session
app.post("/api/checkout/create-session", async (req: Request, res: Response) => {
  if (!isStripeConfigured() || !stripe) {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }

  const authToken = req.headers.authorization?.replace("Bearer ", "");
  if (!authToken) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const { tier } = req.body as { tier: PricingTier };

  if (!tier || !PRICING_TIERS[tier]) {
    res.status(400).json({ error: "Invalid tier" });
    return;
  }

  const tierConfig = PRICING_TIERS[tier];
  if (!tierConfig.priceId) {
    res.status(503).json({ error: "Price not configured for this tier" });
    return;
  }

  try {
    // Get user info from Convex
    const user = await convex.callQueryWithAuth("users:getCurrentUser", {}, authToken);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Create or get Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId && user.email) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: {
          convexUserId: user._id,
        },
      });
      customerId = customer.id;

      // Save customer ID to Convex
      await convex.callInternalMutation("purchases:updateStripeCustomerId", {
        userEmail: user.email,
        stripeCustomerId: customerId,
      });
    }

    // Create checkout session
    const successUrl = `${req.headers.origin || process.env.APP_URL || "http://localhost:3000"}/purchase/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${req.headers.origin || process.env.APP_URL || "http://localhost:3000"}/pricing`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId || undefined,
      customer_email: !customerId ? user.email : undefined,
      payment_method_types: ["card", "link"],
      line_items: [
        {
          price: tierConfig.priceId,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        tier,
        credits: tierConfig.credits.toString(),
        convexUserId: user._id,
      },
    });

    // Create pending purchase in Convex
    await convex.callMutationWithAuth(
      "purchases:createPendingPurchase",
      {
        stripeSessionId: session.id,
        tier,
        creditsAdded: tierConfig.credits,
        amountPaid: tierConfig.price * 100, // Convert to cents
      },
      authToken
    );

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("Failed to create checkout session:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create checkout session",
    });
  }
});

// Get checkout session status
app.get("/api/checkout/session/:sessionId", async (req: Request, res: Response) => {
  if (!isStripeConfigured() || !stripe) {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }

  const authToken = req.headers.authorization?.replace("Bearer ", "");
  if (!authToken) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    // Get purchase from Convex
    const purchase = await convex.callQueryWithAuth(
      "purchases:getPurchaseBySession",
      { stripeSessionId: req.params.sessionId },
      authToken
    );

    res.json({
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      tier: session.metadata?.tier,
      credits: session.metadata?.credits ? parseInt(session.metadata.credits) : null,
      purchase: purchase || null,
    });
  } catch (error) {
    console.error("Failed to get checkout session:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get checkout session",
    });
  }
});

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    convexConfigured: convex.isConvexConfigured(),
    stripeConfigured: isStripeConfigured(),
  });
});

// Static file serving
app.use(async (req: Request, res: Response) => {
  const requestPath = req.path === "/" ? "/index.html" : req.path;
  const filePath = join(PUBLIC_DIR, requestPath);

  try {
    // Check if file exists
    await stat(filePath);
    const content = await readFile(filePath);
    const contentType = getContentType(filePath);
    res.setHeader("Content-Type", contentType);
    res.send(content);
  } catch (error) {
    // File not found - serve index.html for SPA routing
    try {
      const indexPath = join(PUBLIC_DIR, "index.html");
      const content = await readFile(indexPath);
      res.setHeader("Content-Type", "text/html");
      res.send(content);
    } catch {
      res.status(404).send("Not Found");
    }
  }
});

app.listen(PORT, () => {
  console.log(`UI QA Web Server running at http://localhost:${PORT}`);
  console.log(`Convex configured: ${convex.isConvexConfigured()}`);
});
