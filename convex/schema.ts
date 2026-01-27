import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    title: v.string(),
    status: v.union(
      v.literal("backlog"),
      v.literal("in_progress"),
      v.literal("done"),
    ),
    description: v.string(),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["order"])
    .index("by_status_order", ["status", "order"]),

  messages: defineTable({
    taskId: v.string(),
    text: v.string(),
    author: v.string(),
    createdAt: v.number(),
  }).index("by_task_createdAt", ["taskId", "createdAt"]),

  task_events: defineTable({
    taskId: v.string(),
    type: v.string(),
    actor: v.string(),
    payload: v.object({
      from: v.optional(v.string()),
      to: v.optional(v.string()),
      textPreview: v.optional(v.string()),
      fromIndex: v.optional(v.number()),
      toIndex: v.optional(v.number()),
    }),
    createdAt: v.number(),
  }).index("by_task_createdAt", ["taskId", "createdAt"]),

  app_state: defineTable({
    key: v.string(),
    value: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
