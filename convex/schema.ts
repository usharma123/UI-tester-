import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    remainingRuns: v.number(), // Starts at 5
    stripeCustomerId: v.optional(v.string()), // Stripe customer ID
    lifetimePurchases: v.optional(v.number()), // Total amount purchased in cents
  })
    .index("by_email", ["email"])
    .index("by_stripe_customer", ["stripeCustomerId"]),

  runs: defineTable({
    url: v.string(),
    goals: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    score: v.optional(v.number()),
    summary: v.optional(v.string()),
    report: v.optional(v.any()), // Full report JSON
    evidence: v.optional(v.any()), // Full evidence JSON
    error: v.optional(v.string()), // Error message if failed
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    userId: v.optional(v.id("users")), // Associate with user (optional for backward compatibility)
  })
    .index("by_status", ["status"])
    .index("by_user", ["userId"]), // Query by user

  screenshots: defineTable({
    runId: v.id("runs"),
    storageId: v.id("_storage"),
    stepIndex: v.number(),
    label: v.string(),
    createdAt: v.number(),
  }).index("by_run", ["runId"]),

  purchases: defineTable({
    userId: v.id("users"),
    stripeSessionId: v.string(), // Checkout session ID
    stripePaymentIntentId: v.optional(v.string()), // Payment intent ID
    tier: v.union(v.literal("starter"), v.literal("pro"), v.literal("team")),
    creditsAdded: v.number(), // Number of runs added
    amountPaid: v.number(), // Amount in cents
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("refunded")
    ),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_session", ["stripeSessionId"])
    .index("by_status", ["status"]),
});
