import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Generate upload URL for a screenshot
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Save screenshot metadata after upload
export const saveScreenshot = mutation({
  args: {
    runId: v.id("runs"),
    storageId: v.id("_storage"),
    stepIndex: v.number(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const screenshotId = await ctx.db.insert("screenshots", {
      runId: args.runId,
      storageId: args.storageId,
      stepIndex: args.stepIndex,
      label: args.label,
      createdAt: Date.now(),
    });
    return screenshotId;
  },
});

// Get all screenshots for a run
export const getScreenshotsForRun = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const screenshots = await ctx.db
      .query("screenshots")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    // Sort by stepIndex
    screenshots.sort((a, b) => a.stepIndex - b.stepIndex);

    // Generate URLs for all screenshots
    const withUrls = await Promise.all(
      screenshots.map(async (screenshot) => ({
        ...screenshot,
        url: await ctx.storage.getUrl(screenshot.storageId),
      }))
    );

    return withUrls;
  },
});

// Delete screenshot (cleanup)
export const deleteScreenshot = mutation({
  args: { screenshotId: v.id("screenshots") },
  handler: async (ctx, args) => {
    const screenshot = await ctx.db.get(args.screenshotId);
    if (screenshot) {
      await ctx.storage.delete(screenshot.storageId);
      await ctx.db.delete(args.screenshotId);
    }
  },
});
