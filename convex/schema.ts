import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
  }).index("by_status", ["status"]),

  screenshots: defineTable({
    runId: v.id("runs"),
    storageId: v.id("_storage"),
    stepIndex: v.number(),
    label: v.string(),
    createdAt: v.number(),
  }).index("by_run", ["runId"]),
});
