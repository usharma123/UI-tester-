import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Create a pending purchase when checkout starts
export const createPendingPurchase = mutation({
  args: {
    stripeSessionId: v.string(),
    tier: v.union(v.literal("starter"), v.literal("pro"), v.literal("team")),
    creditsAdded: v.number(),
    amountPaid: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required");
    }

    // Find user by email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Create pending purchase record
    const purchaseId = await ctx.db.insert("purchases", {
      userId: user._id,
      stripeSessionId: args.stripeSessionId,
      tier: args.tier,
      creditsAdded: args.creditsAdded,
      amountPaid: args.amountPaid,
      status: "pending",
      createdAt: Date.now(),
    });

    return purchaseId;
  },
});

// Complete a purchase and add credits (called by webhook - internal mutation)
export const completePurchase = internalMutation({
  args: {
    stripeSessionId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find the pending purchase
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_session", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .first();

    if (!purchase) {
      throw new Error(`Purchase not found for session: ${args.stripeSessionId}`);
    }

    if (purchase.status === "completed") {
      // Already completed - idempotent
      return { alreadyCompleted: true, purchaseId: purchase._id };
    }

    // Update purchase status
    await ctx.db.patch(purchase._id, {
      status: "completed",
      stripePaymentIntentId: args.stripePaymentIntentId,
      completedAt: Date.now(),
    });

    // Add credits to user
    const user = await ctx.db.get(purchase.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const newRemainingRuns = (user.remainingRuns || 0) + purchase.creditsAdded;
    const newLifetimePurchases = (user.lifetimePurchases || 0) + purchase.amountPaid;

    await ctx.db.patch(purchase.userId, {
      remainingRuns: newRemainingRuns,
      lifetimePurchases: newLifetimePurchases,
    });

    return {
      alreadyCompleted: false,
      purchaseId: purchase._id,
      creditsAdded: purchase.creditsAdded,
      newBalance: newRemainingRuns,
    };
  },
});

// Mark a purchase as failed (called by webhook - internal mutation)
export const markPurchaseFailed = internalMutation({
  args: {
    stripeSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_session", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .first();

    if (!purchase) {
      return { notFound: true };
    }

    if (purchase.status !== "pending") {
      return { alreadyProcessed: true, status: purchase.status };
    }

    await ctx.db.patch(purchase._id, {
      status: "failed",
      completedAt: Date.now(),
    });

    return { marked: true };
  },
});

// Mark a purchase as refunded and remove credits (called by webhook - internal mutation)
export const markPurchaseRefunded = internalMutation({
  args: {
    stripePaymentIntentId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find purchase by payment intent ID
    const purchases = await ctx.db.query("purchases").collect();
    const purchase = purchases.find(
      (p) => p.stripePaymentIntentId === args.stripePaymentIntentId
    );

    if (!purchase) {
      return { notFound: true };
    }

    if (purchase.status === "refunded") {
      return { alreadyRefunded: true };
    }

    // Update purchase status
    await ctx.db.patch(purchase._id, {
      status: "refunded",
    });

    // Remove credits from user (but don't go below 0)
    const user = await ctx.db.get(purchase.userId);
    if (user) {
      const newRemainingRuns = Math.max(0, (user.remainingRuns || 0) - purchase.creditsAdded);
      await ctx.db.patch(purchase.userId, {
        remainingRuns: newRemainingRuns,
      });
    }

    return { refunded: true, creditsRemoved: purchase.creditsAdded };
  },
});

// Get purchase history for the current user
export const getPurchaseHistory = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .first();

    if (!user) {
      return [];
    }

    const purchases = await ctx.db
      .query("purchases")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return purchases;
  },
});

// Get a specific purchase by session ID
export const getPurchaseBySession = query({
  args: {
    stripeSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_session", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .first();

    if (!purchase) {
      return null;
    }

    // Verify the purchase belongs to the current user
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .first();

    if (!user || purchase.userId !== user._id) {
      return null;
    }

    return purchase;
  },
});

// Update user's Stripe customer ID (called by server - internal mutation)
export const updateStripeCustomerId = internalMutation({
  args: {
    userEmail: v.string(),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, {
      stripeCustomerId: args.stripeCustomerId,
    });

    return { updated: true };
  },
});

// Get user by Stripe customer ID (internal query for webhooks)
export const getUserByStripeCustomerId = internalMutation({
  args: {
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripe_customer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();

    return user;
  },
});
