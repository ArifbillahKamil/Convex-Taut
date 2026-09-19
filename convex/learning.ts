import { v, ConvexError } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import { requireUser, requireVerified, cleanText, limits } from "./lib";
import { citationValidator, sessionFields } from "./schema";
import { createThread } from "@convex-dev/agent";

const sessionDoc = v.object({
  _id: v.id("sessions"),
  _creationTime: v.number(),
  ...sessionFields,
});
const turnDoc = v.object({
  _id: v.id("turns"),
  _creationTime: v.number(),
  userId: v.id("users"),
  sessionId: v.id("sessions"),
  requestId: v.string(),
  prompt: v.string(),
  answer: v.string(),
  citations: v.array(citationValidator),
  createdAt: v.number(),
});
const questionDoc = v.object({
  _id: v.id("questions"),
  _creationTime: v.number(),
  userId: v.id("users"),
  text: v.string(),
  answer: v.string(),
  citations: v.array(citationValidator),
  status: v.union(v.literal("pending"), v.literal("ready"), v.literal("error")),
  error: v.optional(v.string()),
  requestId: v.string(),
});
export const sessions = query({
  args: {},
  returns: v.array(sessionDoc),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return ctx.db
      .query("sessions")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});
export const turns = query({
  args: { sessionId: v.id("sessions") },
  returns: v.array(turnDoc),
  handler: async (ctx, { sessionId }) => {
    const userId = await requireUser(ctx),
      session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId)
      throw new ConvexError("Session unavailable.");
    return (
      await ctx.db
        .query("turns")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .order("desc")
        .take(50)
    ).reverse();
  },
});
export const questions = query({
  args: {},
  returns: v.array(questionDoc),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return ctx.db
      .query("questions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});
export const ask = mutation({
  args: {
    text: v.string(),
    sourceIds: v.array(v.id("sources")),
    requestId: v.string(),
  },
  returns: v.id("questions"),
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx),
      text = cleanText(a.text, 2000, "Question"),
      requestId = cleanText(a.requestId, 100, "Request");
    const prior = await ctx.db
      .query("questions")
      .withIndex("by_user_request", (q) =>
        q.eq("userId", userId).eq("requestId", requestId),
      )
      .unique();
    if (prior) return prior._id;
    if (!process.env.OPENAI_API_KEY)
      throw new ConvexError(
        "AI is not connected yet. Your saved sources are still available.",
      );
    if (!a.sourceIds.length || a.sourceIds.length > 8)
      throw new ConvexError("Choose one to eight sources.");
    for (const id of a.sourceIds) {
      const s = await ctx.db.get(id);
      if (!s || s.userId !== userId || s.status !== "ready")
        throw new ConvexError("One of the selected sources is unavailable.");
    }
    await requireVerified(ctx, userId);
    await limits.limit(ctx, "userAI", { key: userId, throws: true });
    await limits.limit(ctx, "ai", { key: userId, throws: true });
    await limits.limit(ctx, "globalAI", { throws: true });
    const id = await ctx.db.insert("questions", {
      userId,
      text,
      requestId,
      answer: "",
      citations: [],
      status: "pending",
    });
    await ctx.scheduler.runAfter(0, internal.ai.answer, {
      id,
      userId,
      text,
      sourceIds: a.sourceIds,
    });
    await ctx.scheduler.runAfter(120000, internal.learning.finishQuestion, {
      id,
      answer: "",
      citations: [],
      error: "This answer took too long. Please try again.",
    });
    return id;
  },
});
export const begin = mutation({
  args: {
    goal: v.string(),
    sourceIds: v.array(v.id("sources")),
    requestId: v.string(),
  },
  returns: v.id("sessions"),
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx),
      goal = cleanText(a.goal, 300, "Learning goal"),
      requestId = cleanText(a.requestId, 100, "Request");
    const prior = await ctx.db
      .query("sessions")
      .withIndex("by_user_request", (q) =>
        q.eq("userId", userId).eq("requestId", requestId),
      )
      .unique();
    if (prior) return prior._id;
    if (!process.env.OPENAI_API_KEY)
      throw new ConvexError("Connect OpenAI to start a learning session.");
    if (!a.sourceIds.length || a.sourceIds.length > 8)
      throw new ConvexError("Choose one to eight sources.");
    for (const id of a.sourceIds) {
      const s = await ctx.db.get(id);
      if (!s || s.userId !== userId || s.status !== "ready")
        throw new ConvexError("Source unavailable.");
    }
    if (
      (
        await ctx.db
          .query("sessions")
          .withIndex("by_user_updated", (q) => q.eq("userId", userId))
          .take(50)
      ).length >= 50
    )
      throw new ConvexError("The early version supports 50 learning sessions.");
    await requireVerified(ctx, userId);
    await limits.limit(ctx, "userAI", { key: userId, throws: true });
    await limits.limit(ctx, "ai", { key: userId, throws: true });
    await limits.limit(ctx, "globalAI", { throws: true });
    const threadId = await createThread(ctx, components.agent, {
      userId,
      title: goal,
    });
    const id = await ctx.db.insert("sessions", {
      userId,
      goal,
      sourceIds: [...new Set(a.sourceIds)],
      threadId,
      state: "active",
      busy: true,
      pendingAt: Date.now(),
      activeRequestId: requestId,
      updatedAt: Date.now(),
      requestId,
      lastQuestion: "",
      preview: "",
      turnCount: 0,
    });
    await ctx.scheduler.runAfter(0, internal.ai.coach, {
      id,
      requestId,
      prompt: "Start my learning session.",
    });
    await ctx.scheduler.runAfter(120000, internal.learning.finishTurn, {
      id,
      requestId,
      prompt: "",
      answer: "",
      question: "",
      citations: [],
      error: "The session took too long to respond. Try your message again.",
    });
    return id;
  },
});
export const reply = mutation({
  args: { id: v.id("sessions"), prompt: v.string(), requestId: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx),
      s = await ctx.db.get(a.id),
      prompt = cleanText(a.prompt, 3000, "Response"),
      requestId = cleanText(a.requestId, 100, "Request");
    if (!s || s.userId !== userId)
      throw new ConvexError("Session unavailable.");
    if (
      s.activeRequestId === requestId ||
      (await ctx.db
        .query("turns")
        .withIndex("by_session_request", (q) =>
          q.eq("sessionId", a.id).eq("requestId", requestId),
        )
        .first())
    )
      return null;
    if (s.busy)
      throw new ConvexError("Your learning companion is still responding.");
    if (s.turnCount >= 50)
      throw new ConvexError(
        "Start a new session to keep exploring. This one has reached 50 turns.",
      );
    await requireVerified(ctx, userId);
    await limits.limit(ctx, "userAI", { key: userId, throws: true });
    await limits.limit(ctx, "ai", { key: userId, throws: true });
    await limits.limit(ctx, "globalAI", { throws: true });
    await ctx.db.patch(a.id, {
      busy: true,
      state: "active",
      pendingAt: Date.now(),
      activeRequestId: requestId,
      error: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.ai.coach, { ...a, prompt });
    await ctx.scheduler.runAfter(120000, internal.learning.finishTurn, {
      id: a.id,
      requestId,
      prompt: "",
      answer: "",
      question: "",
      citations: [],
      error: "This response took too long. Please try again.",
    });
    return null;
  },
});
export const setState = mutation({
  args: {
    id: v.id("sessions"),
    state: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const u = await requireUser(ctx),
      s = await ctx.db.get(a.id);
    if (!s || s.userId !== u) throw new ConvexError("Session unavailable.");
    await ctx.db.patch(a.id, { state: a.state, updatedAt: Date.now() });
    return null;
  },
});
export const getSession = internalQuery({
  args: { id: v.id("sessions") },
  returns: v.union(sessionDoc, v.null()),
  handler: (ctx, a) => ctx.db.get(a.id),
});
export const finishQuestion = internalMutation({
  args: {
    id: v.id("questions"),
    answer: v.string(),
    citations: v.array(citationValidator),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...a }) => {
    const q = await ctx.db.get(id);
    if (q?.status === "pending")
      await ctx.db.patch(id, { ...a, status: a.error ? "error" : "ready" });
    return null;
  },
});
export const finishTurn = internalMutation({
  args: {
    id: v.id("sessions"),
    requestId: v.string(),
    prompt: v.string(),
    answer: v.string(),
    question: v.string(),
    citations: v.array(citationValidator),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const s = await ctx.db.get(a.id);
    if (!s || !s.busy || s.activeRequestId !== a.requestId) return null;
    await ctx.db.patch(a.id, {
      busy: false,
      error: a.error,
      updatedAt: Date.now(),
      ...(!a.error
        ? {
            lastQuestion: a.question,
            preview: a.answer.slice(0, 180),
            turnCount: s.turnCount + 1,
          }
        : {}),
    });
    if (!a.error)
      await ctx.db.insert("turns", {
        sessionId: a.id,
        userId: s.userId,
        requestId: a.requestId,
        prompt: a.prompt,
        answer: a.answer + (a.question ? "\n\n" + a.question : ""),
        citations: a.citations,
        createdAt: Date.now(),
      });
    return null;
  },
});
