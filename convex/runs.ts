import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Helper to get current user from identity
async function getCurrentUserFromIdentity(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_email", (q: any) => q.eq("email", identity.email))
    .first();
}

// Create a new run entry
export const createRun = mutation({
  args: {
    url: v.string(),
    goals: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromIdentity(ctx);
    if (!user) throw new Error("Authentication required");

    if (user.remainingRuns <= 0) {
      throw new Error("No remaining runs");
    }

    // Decrement remaining runs
    await ctx.db.patch(user._id, { remainingRuns: user.remainingRuns - 1 });

    // Create run with userId
    const runId = await ctx.db.insert("runs", {
      url: args.url,
      goals: args.goals,
      status: "running",
      startedAt: Date.now(),
      userId: user._id,
    });
    return runId;
  },
});

// Update run status (for progress updates)
export const updateRunStatus = mutation({
  args: {
    runId: v.id("runs"),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
    });
  },
});

// Complete a run with results
export const completeRun = mutation({
  args: {
    runId: v.id("runs"),
    score: v.number(),
    summary: v.string(),
    report: v.any(),
    evidence: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "completed",
      score: args.score,
      summary: args.summary,
      report: args.report,
      evidence: args.evidence,
      completedAt: Date.now(),
    });
  },
});

// Fail a run with error
export const failRun = mutation({
  args: {
    runId: v.id("runs"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error,
      completedAt: Date.now(),
    });
  },
});

// Get a run by ID with screenshot URLs
export const getRun = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;

    // Get all screenshots for this run
    const screenshots = await ctx.db
      .query("screenshots")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    // Generate URLs for all screenshots
    const screenshotsWithUrls = await Promise.all(
      screenshots.map(async (screenshot) => ({
        ...screenshot,
        url: await ctx.storage.getUrl(screenshot.storageId),
      }))
    );

    return {
      ...run,
      screenshots: screenshotsWithUrls,
    };
  },
});

// List recent runs for the authenticated user
export const listRuns = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromIdentity(ctx);
    if (!user) return [];

    const limit = args.limit ?? 10;
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);

    return runs.map((run) => ({
      _id: run._id,
      url: run.url,
      goals: run.goals,
      status: run.status,
      score: run.score,
      summary: run.summary,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    }));
  },
});

// Get screenshot URL by storageId
export const getScreenshotUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
