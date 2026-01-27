import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const normalizeActor = (actor?: string) => {
  const trimmed = actor?.trim() ?? "";
  return trimmed === "demo-user" ? "demo-user" : "anonymous";
};

const buildPreview = (text: string) => text.slice(0, 80);

export const listByTask = query({
  args: { taskId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_task_createdAt", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .collect();
  },
});

export const send = mutation({
  args: {
    taskId: v.string(),
    text: v.string(),
    author: v.string(),
  },
  handler: async (ctx, args) => {
    const text = args.text.trim();
    const author = args.author.trim();
    if (!text || !author) return null;

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      taskId: args.taskId,
      text,
      author,
      createdAt: now,
    });

    await ctx.db.insert("task_events", {
      taskId: args.taskId,
      type: "message_sent",
      actor: normalizeActor(author),
      payload: { textPreview: buildPreview(text) },
      createdAt: now,
    });

    return messageId;
  },
});
