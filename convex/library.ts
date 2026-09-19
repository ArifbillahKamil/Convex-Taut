import { v, ConvexError } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { sourceFields } from "./schema";
import {
  requireUser,
  requireVerified,
  cleanText,
  publicUrl,
  limits,
} from "./lib";
import { samples } from "./samples";
import { start } from "@convex-dev/workflow";
import { storeBody, withBody, countWords } from "./sourceStorage";

export const sourceDoc = v.object({
  _id: v.id("sources"),
  _creationTime: v.number(),
  ...sourceFields,
});
export const list = query({
  args: {
    search: v.optional(v.string()),
    kind: v.optional(
      v.union(v.literal("article"), v.literal("note"), v.literal("email")),
    ),
    favorites: v.optional(v.boolean()),
  },
  returns: v.array(sourceDoc),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    // The workspace is capped at 200 sources; filters therefore operate on the complete bounded collection.
    const rows = await ctx.db
      .query("sources")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(201);
    const term = (args.search ?? "").trim().toLowerCase().slice(0, 200);
    const bodyMatches = term
      ? await ctx.db
          .query("sourceBodies")
          .withSearchIndex("search_content", (q) =>
            q.search("content", term).eq("userId", userId),
          )
          .take(40)
      : [];
    const matchedBodyIds = new Set(bodyMatches.map((body) => body._id));
    return rows
      .filter(
        (s) =>
          (!args.kind || s.kind === args.kind) &&
          (!args.favorites || s.favorite) &&
          (!term ||
            `${s.title} ${s.content} ${s.topic} ${s.excerpt}`
              .toLowerCase()
              .includes(term) ||
            (!!s.bodyId && matchedBodyIds.has(s.bodyId))),
      )
      .sort((a, b) => b.capturedAt - a.capturedAt)
      .map((source) => ({
        ...source,
        wordCount: source.wordCount ?? countWords(source.content),
        content: "",
      }));
  },
});
export const get = query({
  args: { id: v.id("sources") },
  returns: v.union(sourceDoc, v.null()),
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const source = await ctx.db.get(id);
    return source?.userId === userId ? withBody(ctx, source) : null;
  },
});
export const save = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    url: v.optional(v.string()),
    topic: v.string(),
    intention: v.string(),
    requestId: v.string(),
  },
  returns: v.id("sources"),
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx);
    const requestId = cleanText(a.requestId, 100, "Request");
    const existing = await ctx.db
      .query("sources")
      .withIndex("by_user_request", (q) =>
        q.eq("userId", userId).eq("requestId", requestId),
      )
      .unique();
    if (existing) return existing._id;
    const url = a.url ? publicUrl(a.url).toString() : undefined;
    if (url) {
      const duplicate = await ctx.db
        .query("sources")
        .withIndex("by_user_url", (q) => q.eq("userId", userId).eq("url", url))
        .first();
      if (duplicate) return duplicate._id;
      if (!process.env.FIRECRAWL_API_KEY)
        throw new ConvexError(
          "Link import is not connected yet. Paste the text as a note instead.",
        );
    }
    if (
      (
        await ctx.db
          .query("sources")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(200)
      ).length >= 200
    )
      throw new ConvexError(
        "This early version holds 200 sources. Remove a source to make room.",
      );
    if (url) {
      await requireVerified(ctx, userId);
      await limits.limit(ctx, "userImport", { key: userId, throws: true });
      await limits.limit(ctx, "globalImport", { throws: true });
    }
    await limits.limit(ctx, "save", { key: userId, throws: true });
    const content = url ? "" : cleanText(a.content, 50000, "Note");
    const id = await ctx.db.insert("sources", {
      userId,
      title: cleanText(
        a.title || (url ? new URL(url).hostname : ""),
        180,
        "Title",
      ),
      content: "",
      bodyId: content ? await storeBody(ctx, userId, content) : undefined,
      wordCount: countWords(content),
      excerpt: content.slice(0, 240),
      kind: url ? "article" : "note",
      url,
      domain: url
        ? new URL(url).hostname.replace(/^www\./, "")
        : "Personal note",
      topic: a.topic.trim().slice(0, 50) || "Unsorted",
      intention: a.intention.trim().slice(0, 400),
      status: url ? "processing" : "ready",
      read: false,
      favorite: false,
      requestId,
      capturedAt: Date.now(),
    });
    if (url)
      await start(ctx, internal.ingest.importPage, { sourceId: id, url });
    return id;
  },
});
export const update = mutation({
  args: {
    id: v.id("sources"),
    read: v.optional(v.boolean()),
    favorite: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const userId = await requireUser(ctx),
      source = await ctx.db.get(id);
    if (!source || source.userId !== userId)
      throw new ConvexError("Source unavailable.");
    const fields: { read?: boolean; favorite?: boolean } = {};
    if (patch.read !== undefined) fields.read = patch.read;
    if (patch.favorite !== undefined) fields.favorite = patch.favorite;
    await ctx.db.patch(id, fields);
    return null;
  },
});
export const remove = mutation({
  args: { id: v.id("sources") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx),
      source = await ctx.db.get(id);
    if (source && source.userId !== userId)
      throw new ConvexError("Source unavailable.");
    if (source) {
      if (source.bodyId) await ctx.db.delete(source.bodyId);
      await ctx.db.delete(id);
    }
    return null;
  },
});
export const seed = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (profile?.seeded) return null;
    if (
      (
        await ctx.db
          .query("sources")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(196)
      ).length > 195
    )
      throw new ConvexError("Make room for five sample notes first.");
    for (const [i, s] of samples.entries())
      await ctx.db.insert("sources", {
        ...s,
        content: "",
        bodyId: await storeBody(ctx, userId, s.content),
        wordCount: countWords(s.content),
        userId,
        kind: "note",
        excerpt: s.content.slice(0, 200),
        domain: "Taut example",
        intention: "An original example note to explore Taut.",
        status: "ready",
        read: false,
        favorite: false,
        requestId: `sample-${i}`,
        capturedAt: Date.now() - i * 86400000,
        sample: true,
      });
    if (profile) await ctx.db.patch(profile._id, { seeded: true });
    else await ctx.db.insert("profiles", { userId, seeded: true });
    return null;
  },
});
export const getContext = internalQuery({
  args: { userId: v.id("users"), ids: v.array(v.id("sources")) },
  returns: v.array(sourceDoc),
  handler: async (ctx, { userId, ids }) => {
    if (ids.length > 8) throw new ConvexError("Choose up to eight sources.");
    const rows = await Promise.all(
      [...new Set(ids)].map((id) => ctx.db.get(id)),
    );
    return Promise.all(
      rows
        .filter(
          (s): s is NonNullable<typeof s> =>
            !!s && s.userId === userId && s.status === "ready",
        )
        .map((source) => withBody(ctx, source)),
    );
  },
});
export const imported = internalMutation({
  args: {
    id: v.id("sources"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    if (!source || source.status !== "processing") return null;
    if (a.error) await ctx.db.patch(a.id, { status: "error", error: a.error });
    else if (a.content?.trim())
      await ctx.db.patch(a.id, {
        status: "ready",
        title: a.title?.slice(0, 180) || source.title,
        content: "",
        bodyId: await storeBody(ctx, source.userId, a.content.slice(0, 50000)),
        wordCount: countWords(a.content.slice(0, 50000)),
        excerpt: a.content.slice(0, 240),
        truncated: a.content.length > 50000,
        error: undefined,
      });
    return null;
  },
});
export const settings = query({
  args: {},
  returns: v.object({
    openai: v.boolean(),
    firecrawl: v.boolean(),
    mail: v.boolean(),
    inboxId: v.union(v.string(), v.null()),
    captureSubject: v.union(v.string(), v.null()),
    seeded: v.boolean(),
  }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx),
      p = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
    return {
      openai: !!process.env.OPENAI_API_KEY,
      firecrawl: !!process.env.FIRECRAWL_API_KEY,
      mail:
        !!process.env.AGENTMAIL_API_KEY &&
        !!process.env.AGENTMAIL_WEBHOOK_SECRET,
      inboxId:
        p?.inboxId ??
        (p?.captureToken
          ? (process.env.AGENTMAIL_CAPTURE_ADDRESS ?? null)
          : null),
      captureSubject: p?.captureToken ? `[TAUT ${p.captureToken}]` : null,
      seeded: p?.seeded ?? false,
    };
  },
});
