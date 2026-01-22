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
  }).index("by_email", ["email"]),

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
    userId: v.id("users"), // Associate with user
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
});
