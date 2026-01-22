import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

// Get or create user based on WorkOS identity
export const getOrCreateUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Check if user already exists by email
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .first();

    if (existingUser) {
      return existingUser;
    }

    // Create new user with 5 free runs
    const userId = await ctx.db.insert("users", {
      name: identity.name ?? undefined,
      email: identity.email ?? undefined,
      remainingRuns: 5,
    });

    return await ctx.db.get(userId);
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Find user by email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .first();

    return user;
  },
});

export const getRemainingRuns = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .first();

    return user?.remainingRuns ?? 0;
  },
});

export const initializeNewUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (user && user.remainingRuns === undefined) {
      await ctx.db.patch(userId, { remainingRuns: 5 });
    }
  },
});
