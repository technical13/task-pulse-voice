import { mutation } from "./_generated/server";
import { normalizeLegacyStatus } from "./tasks";

export const contractSchemaNote = mutation({
  args: {},
  handler: async () => {
    return [
      "After running the migration, return the schema to strict statuses:",
      `"backlog" | "in_progress" | "done".`,
      "Remove legacy values (active/completed/in-progress) from the validator.",
    ].join(" ");
  },
});

export const fixTaskStatuses = mutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    const now = Date.now();
    let updatedCount = 0;

    for (const task of tasks) {
      const normalizedStatus = normalizeLegacyStatus(task.status);
      if (task.status === normalizedStatus) continue;
      await ctx.db.patch(task._id, { status: normalizedStatus, updatedAt: now });
      updatedCount += 1;
    }

    return updatedCount;
  },
});
