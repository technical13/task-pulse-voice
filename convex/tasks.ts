import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";

type TaskStatus = "backlog" | "in_progress" | "done";
type DemoLanguage = "ru" | "en" | "es";
type LegacyTaskStatus =
  | TaskStatus
  | "active"
  | "completed"
  | "in-progress";

const DEMO_SEED_KEY = "demo_seeded";

const legacyTaskStatus = v.union(
  v.literal("backlog"),
  v.literal("in_progress"),
  v.literal("done"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("in-progress"),
);

const normalizeActor = (actor?: string) => {
  const trimmed = actor?.trim() ?? "";
  return trimmed === "demo-user" ? "demo-user" : "anonymous";
};

const buildPreview = (text: string) => text.slice(0, 80);

const demoSeedLanguage = v.union(v.literal("ru"), v.literal("en"), v.literal("es"));

const nextStatus = (status: TaskStatus) => {
  if (status === "backlog") return "in_progress";
  if (status === "in_progress") return "done";
  return "backlog";
};

const getNextOrder = async (ctx: MutationCtx, status: TaskStatus) => {
  const first = await ctx.db
    .query("tasks")
    .withIndex("by_status_order", (q) => q.eq("status", status))
    .order("asc")
    .first();
  return first ? first.order - 1 : 0;
};

export const normalizeLegacyStatus = (
  status?: LegacyTaskStatus | null,
): TaskStatus => {
  if (status === "active") return "backlog";
  if (status === "completed") return "done";
  if (status === "done") return "done";
  if (status === "in-progress") return "in_progress";
  if (status === "backlog") return "backlog";
  if (status === "in_progress") return "in_progress";
  return "backlog";
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tasks").withIndex("by_order").order("asc").collect();
  },
});

export const seedStatus = query({
  args: {},
  handler: async (ctx) => {
    const seededDoc = await ctx.db
      .query("app_state")
      .withIndex("by_key", (q) => q.eq("key", DEMO_SEED_KEY))
      .first();
    return {
      seeded: seededDoc?.value ?? false,
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(legacyTaskStatus),
    order: v.optional(v.number()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const title = args.title.trim();
    if (!title) return null;

    const now = Date.now();
    let order = args.order;
    const status = normalizeLegacyStatus(args.status);

    if (typeof order !== "number") {
      order = await getNextOrder(ctx, status);
    }

    const taskId = await ctx.db.insert("tasks", {
      title,
      status,
      description: args.description ?? "",
      order,
      createdAt: now,
      updatedAt: now,
    });
    const taskIdString = taskId.toString();

    await ctx.db.insert("task_events", {
      taskId: taskIdString,
      type: "task_created",
      actor: normalizeActor(args.actor),
      payload: {},
      createdAt: now,
    });

    return taskId;
  },
});

export const seedDemoData = mutation({
  args: { language: demoSeedLanguage },
  handler: async (ctx, args) => {
    const seededDoc = await ctx.db
      .query("app_state")
      .withIndex("by_key", (q) => q.eq("key", DEMO_SEED_KEY))
      .first();
    const now = Date.now();
    if (seededDoc?.value) {
      const tasks = await ctx.db.query("tasks").collect();
      for (const task of tasks) {
        await ctx.db.delete(task._id);
      }
      const messages = await ctx.db.query("messages").collect();
      for (const message of messages) {
        await ctx.db.delete(message._id);
      }
      const events = await ctx.db.query("task_events").collect();
      for (const event of events) {
        await ctx.db.delete(event._id);
      }
    }

    const minutes = (value: number) => value * 60 * 1000;
    const baseTime = now - minutes(85);
    const actor = "demo-user";

    const demoSeedTemplates: Record<
      DemoLanguage,
      Array<{
        title: string;
        status: TaskStatus;
        order: number;
        description?: string;
        createdOffset: number;
        statusFrom?: TaskStatus;
        statusOffset?: number;
        descriptionOffset?: number;
        messages?: Array<{ text: string; offset: number; author: "Alex" | "Maria" }>;
      }>
    > = {
      en: [
        {
          title: "Plan onboarding checklist",
          status: "backlog",
          order: 0,
          description:
            "Outline the first-run steps so users reach a task in under 60 seconds.",
          createdOffset: 0,
          descriptionOffset: 6,
        },
        {
          title: "Define analytics events",
          status: "backlog",
          order: 1,
          createdOffset: 4,
        },
        {
          title: "Refine drag-and-drop feel",
          status: "in_progress",
          order: 0,
          description:
            "Tighten the pickup, keep the card shadow, and avoid layout jitter.",
          createdOffset: 12,
          statusFrom: "backlog",
          statusOffset: 18,
          descriptionOffset: 22,
          messages: [
            {
              text: "The card should keep its original shadow while dragging.",
              offset: 28,
              author: "Alex",
            },
            {
              text: "I can ship the motion pass today if we lock the offsets.",
              offset: 34,
              author: "Maria",
            },
          ],
        },
        {
          title: "Draft release notes",
          status: "in_progress",
          order: 1,
          createdOffset: 20,
          statusFrom: "backlog",
          statusOffset: 26,
        },
        {
          title: "QA mobile layout",
          status: "in_progress",
          order: 2,
          description:
            "Verify spacing at 320px and ensure the board stays scrollable.",
          createdOffset: 28,
          statusFrom: "backlog",
          statusOffset: 33,
          descriptionOffset: 38,
        },
        {
          title: "Set up demo walkthrough",
          status: "done",
          order: 0,
          createdOffset: 36,
          statusFrom: "backlog",
          statusOffset: 44,
          messages: [
            {
              text: "Walkthrough is ready with 5 steps and auto-focus highlights.",
              offset: 52,
              author: "Alex",
            },
            {
              text: "Added a skip button and reset entry for QA.",
              offset: 58,
              author: "Maria",
            },
          ],
        },
        {
          title: "Polish empty state copy",
          status: "done",
          order: 1,
          description: "Make the empty state feel optimistic and action-oriented.",
          createdOffset: 42,
          statusFrom: "backlog",
          statusOffset: 50,
          descriptionOffset: 56,
        },
      ],
      ru: [
        {
          title: "Составить чек-лист онбординга",
          status: "backlog",
          order: 0,
          description:
            "Определить первые шаги так, чтобы пользователь создавал задачу за 60 секунд.",
          createdOffset: 0,
          descriptionOffset: 6,
        },
        {
          title: "Определить события аналитики",
          status: "backlog",
          order: 1,
          createdOffset: 4,
        },
        {
          title: "Улучшить ощущение drag-and-drop",
          status: "in_progress",
          order: 0,
          description:
            "Подтянуть захват, сохранить тень карточки и убрать дрожание.",
          createdOffset: 12,
          statusFrom: "backlog",
          statusOffset: 18,
          descriptionOffset: 22,
          messages: [
            {
              text: "Во время перетаскивания тень карточки должна сохраняться.",
              offset: 28,
              author: "Alex",
            },
            {
              text: "Могу сегодня закоммитить анимацию, если зафиксируем смещения.",
              offset: 34,
              author: "Maria",
            },
          ],
        },
        {
          title: "Набросать заметки к релизу",
          status: "in_progress",
          order: 1,
          createdOffset: 20,
          statusFrom: "backlog",
          statusOffset: 26,
        },
        {
          title: "Проверить мобильную верстку",
          status: "in_progress",
          order: 2,
          description:
            "Проверить отступы на 320px и убедиться, что доска скроллится.",
          createdOffset: 28,
          statusFrom: "backlog",
          statusOffset: 33,
          descriptionOffset: 38,
        },
        {
          title: "Настроить демо-тур",
          status: "done",
          order: 0,
          createdOffset: 36,
          statusFrom: "backlog",
          statusOffset: 44,
          messages: [
            {
              text: "Демо-тур готов: 5 шагов и автофокус на акцентах.",
              offset: 52,
              author: "Alex",
            },
            {
              text: "Добавила кнопку пропуска и сброс для QA.",
              offset: 58,
              author: "Maria",
            },
          ],
        },
        {
          title: "Отполировать текст пустого состояния",
          status: "done",
          order: 1,
          description:
            "Сделать сообщение дружелюбным и побуждающим к действию.",
          createdOffset: 42,
          statusFrom: "backlog",
          statusOffset: 50,
          descriptionOffset: 56,
        },
      ],
      es: [
        {
          title: "Planificar checklist de onboarding",
          status: "backlog",
          order: 0,
          description:
            "Definir los primeros pasos para que el usuario cree una tarea en menos de 60 segundos.",
          createdOffset: 0,
          descriptionOffset: 6,
        },
        {
          title: "Definir eventos de analitica",
          status: "backlog",
          order: 1,
          createdOffset: 4,
        },
        {
          title: "Mejorar el arrastre y soltado",
          status: "in_progress",
          order: 0,
          description:
            "Ajustar el inicio, mantener la sombra de la tarjeta y evitar saltos de layout.",
          createdOffset: 12,
          statusFrom: "backlog",
          statusOffset: 18,
          descriptionOffset: 22,
          messages: [
            {
              text: "La tarjeta debe conservar su sombra original mientras se arrastra.",
              offset: 28,
              author: "Alex",
            },
            {
              text: "Puedo entregar la animacion hoy si fijamos los offsets.",
              offset: 34,
              author: "Maria",
            },
          ],
        },
        {
          title: "Redactar notas de version",
          status: "in_progress",
          order: 1,
          createdOffset: 20,
          statusFrom: "backlog",
          statusOffset: 26,
        },
        {
          title: "QA del layout movil",
          status: "in_progress",
          order: 2,
          description:
            "Verificar espaciado a 320px y que el tablero siga siendo desplazable.",
          createdOffset: 28,
          statusFrom: "backlog",
          statusOffset: 33,
          descriptionOffset: 38,
        },
        {
          title: "Configurar walkthrough de demo",
          status: "done",
          order: 0,
          createdOffset: 36,
          statusFrom: "backlog",
          statusOffset: 44,
          messages: [
            {
              text: "El walkthrough esta listo con 5 pasos y autofoco en los destacados.",
              offset: 52,
              author: "Alex",
            },
            {
              text: "Agregue un boton de omitir y reinicio para QA.",
              offset: 58,
              author: "Maria",
            },
          ],
        },
        {
          title: "Pulir el texto del estado vacio",
          status: "done",
          order: 1,
          description:
            "Hacer el mensaje del estado vacio optimista y orientado a la accion.",
          createdOffset: 42,
          statusFrom: "backlog",
          statusOffset: 50,
          descriptionOffset: 56,
        },
      ],
    };

    const demoTasks = demoSeedTemplates[args.language];

    const demoTasksForInsert: Array<{
      title: string;
      status: TaskStatus;
      order: number;
      description?: string;
      createdOffset: number;
      statusFrom?: TaskStatus;
      statusOffset?: number;
      descriptionOffset?: number;
      messages?: Array<{ text: string; offset: number; author: "Alex" | "Maria" }>;
    }> = demoTasks;

    for (const task of demoTasksForInsert) {
      const createdAt = baseTime + minutes(task.createdOffset);
      const taskId = await ctx.db.insert("tasks", {
        title: task.title,
        status: task.status,
        description: task.description ?? "",
        order: task.order,
        createdAt,
        updatedAt: createdAt,
      });
      const taskIdString = taskId.toString();
      let updatedAt = createdAt;

      await ctx.db.insert("task_events", {
        taskId: taskIdString,
        type: "task_created",
        actor,
        payload: {},
        createdAt,
      });

      if (task.statusFrom && typeof task.statusOffset === "number") {
        const statusAt = baseTime + minutes(task.statusOffset);
        await ctx.db.insert("task_events", {
          taskId: taskIdString,
          type: "task_status_changed",
          actor,
          payload: { from: task.statusFrom, to: task.status },
          createdAt: statusAt,
        });
        updatedAt = Math.max(updatedAt, statusAt);
      }

      if (task.description && typeof task.descriptionOffset === "number") {
        const descriptionAt = baseTime + minutes(task.descriptionOffset);
        await ctx.db.insert("task_events", {
          taskId: taskIdString,
          type: "task_description_updated",
          actor,
          payload: { textPreview: buildPreview(task.description) },
          createdAt: descriptionAt,
        });
        updatedAt = Math.max(updatedAt, descriptionAt);
      }

      if (task.messages) {
        for (const message of task.messages) {
          const messageAt = baseTime + minutes(message.offset);
          await ctx.db.insert("messages", {
            taskId: taskIdString,
            text: message.text,
            author: message.author,
            createdAt: messageAt,
          });
          await ctx.db.insert("task_events", {
            taskId: taskIdString,
            type: "message_sent",
            actor,
            payload: { textPreview: buildPreview(message.text) },
            createdAt: messageAt,
          });
          updatedAt = Math.max(updatedAt, messageAt);
        }
      }

      if (updatedAt !== createdAt) {
        await ctx.db.patch(taskId, { updatedAt });
      }
    }

    if (seededDoc) {
      await ctx.db.patch(seededDoc._id, {
        value: true,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("app_state", {
        key: DEMO_SEED_KEY,
        value: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return "created";
  },
});

export const setStatus = mutation({
  args: { id: v.id("tasks"), status: legacyTaskStatus, actor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return null;
    const now = Date.now();
    const currentStatus = normalizeLegacyStatus(task.status);
    const targetStatus = normalizeLegacyStatus(args.status);
    const shouldNormalize = task.status !== currentStatus;
    if (currentStatus === targetStatus && !shouldNormalize) return currentStatus;
    const order = await getNextOrder(ctx, targetStatus);
    await ctx.db.patch(args.id, { status: targetStatus, order, updatedAt: now });
    await ctx.db.insert("task_events", {
      taskId: args.id.toString(),
      type: "task_status_changed",
      actor: normalizeActor(args.actor),
      payload: { from: currentStatus, to: targetStatus },
      createdAt: now,
    });
    return targetStatus;
  },
});

export const cycleStatus = mutation({
  args: { id: v.id("tasks"), actor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return null;
    const currentStatus = normalizeLegacyStatus(task.status);
    const status = nextStatus(currentStatus);
    const now = Date.now();
    const order = await getNextOrder(ctx, status);
    await ctx.db.patch(args.id, { status, order, updatedAt: now });
    await ctx.db.insert("task_events", {
      taskId: args.id.toString(),
      type: "task_status_changed",
      actor: normalizeActor(args.actor),
      payload: { from: currentStatus, to: status },
      createdAt: now,
    });
    return status;
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  },
});

export const updateDescription = mutation({
  args: { id: v.id("tasks"), description: v.string(), actor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return null;
    if (task.description === args.description) return null;
    const now = Date.now();
    await ctx.db.patch(args.id, { description: args.description, updatedAt: now });
    await ctx.db.insert("task_events", {
      taskId: args.id.toString(),
      type: "task_description_updated",
      actor: normalizeActor(args.actor),
      payload: { textPreview: buildPreview(args.description.trim()) },
      createdAt: now,
    });
    return null;
  },
});

export const reorder = mutation({
  args: {
    columns: v.array(
      v.object({
        status: legacyTaskStatus,
        orderedIds: v.array(v.id("tasks")),
      }),
    ),
    movedTaskId: v.optional(v.id("tasks")),
    fromStatus: v.optional(legacyTaskStatus),
    toStatus: v.optional(legacyTaskStatus),
    fromIndex: v.optional(v.number()),
    toIndex: v.optional(v.number()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const column of args.columns) {
      const normalizedStatus = normalizeLegacyStatus(column.status);
      for (let index = 0; index < column.orderedIds.length; index += 1) {
        const id = column.orderedIds[index];
        await ctx.db.patch(id, { order: index, status: normalizedStatus, updatedAt: now });
      }
    }
    const movedTaskId = args.movedTaskId?.toString() ?? null;
    if (
      movedTaskId &&
      typeof args.fromIndex === "number" &&
      typeof args.toIndex === "number" &&
      args.fromIndex !== args.toIndex
    ) {
      await ctx.db.insert("task_events", {
        taskId: movedTaskId,
        type: "task_reordered",
        actor: normalizeActor(args.actor),
        payload: { fromIndex: args.fromIndex, toIndex: args.toIndex },
        createdAt: now,
      });
    }
    if (movedTaskId && args.fromStatus && args.toStatus) {
      const normalizedFrom = normalizeLegacyStatus(args.fromStatus);
      const normalizedTo = normalizeLegacyStatus(args.toStatus);
      if (normalizedFrom !== normalizedTo) {
        await ctx.db.insert("task_events", {
          taskId: movedTaskId,
          type: "task_status_changed",
          actor: normalizeActor(args.actor),
          payload: { from: normalizedFrom, to: normalizedTo },
          createdAt: now,
        });
      }
    }
    return null;
  },
});
