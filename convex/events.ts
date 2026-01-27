import { query } from "./_generated/server";
import { v } from "convex/values";

export const listByTask = query({
  args: { taskId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("task_events")
      .withIndex("by_task_createdAt", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .collect();
  },
});
