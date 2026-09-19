import { AgentMail } from "@agentmail/convex";
import { v, ConvexError } from "convex/values";
import { z } from "zod";
import { action, internalMutation } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { requireUser, requireVerified, limits } from "./lib";
import { storeBody, countWords } from "./sourceStorage";

export const mailClient = new AgentMail(components.agentmail, {
  onMessageReceived: internal.mail.received,
});
export const enableSharedCapture = internalMutation({
  args: { userId: v.id("users"), token: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, token }) => {
    await requireVerified(ctx, userId);
    if (!/^[a-f0-9]{32}$/.test(token)) throw new Error("Invalid capture token");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (profile?.captureToken || profile?.inboxId) return null;
    if (profile) await ctx.db.patch(profile._id, { captureToken: token });
    else
      await ctx.db.insert("profiles", {
        userId,
        seeded: false,
        captureToken: token,
      });
    return null;
  },
});
export const reserve = internalMutation({
  args: { userId: v.id("users") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { userId }) => {
    await requireVerified(ctx, userId);
    const p = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (p?.inboxId) return p.inboxId;
    if (p?.inboxCreating && (p.inboxStartedAt ?? 0) > Date.now() - 120000)
      throw new ConvexError(
        "Your inbox is being created. Try again in a moment.",
      );
    await limits.limit(ctx, "inbox", { throws: true });
    if (p)
      await ctx.db.patch(p._id, {
        inboxCreating: true,
        inboxStartedAt: Date.now(),
      });
    else
      await ctx.db.insert("profiles", {
        userId,
        seeded: false,
        inboxCreating: true,
        inboxStartedAt: Date.now(),
      });
    return null;
  },
});
export const attach = internalMutation({
  args: { userId: v.id("users"), inboxId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, a) => {
    const p = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", a.userId))
      .unique();
    if (p)
      await ctx.db.patch(p._id, {
        inboxCreating: false,
        ...(a.inboxId ? { inboxId: a.inboxId } : {}),
      });
    return null;
  },
});
export const createInbox = action({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const userId = await requireUser(ctx);
    if (!process.env.AGENTMAIL_API_KEY || !process.env.AGENTMAIL_WEBHOOK_SECRET)
      throw new ConvexError("Email capture is not connected yet.");
    if (
      process.env.AGENTMAIL_CAPTURE_INBOX_ID &&
      process.env.AGENTMAIL_CAPTURE_ADDRESS
    ) {
      await ctx.runMutation(internal.mail.enableSharedCapture, {
        userId,
        token: crypto.randomUUID().replaceAll("-", ""),
      });
      return process.env.AGENTMAIL_CAPTURE_ADDRESS;
    }
    const existing = await ctx.runMutation(internal.mail.reserve, { userId });
    if (existing) return existing;
    try {
      const inbox = await mailClient.createInbox(ctx, {
        displayName: "Taut reading inbox",
        clientId: `taut-${userId}`,
      });
      if (typeof inbox.inbox_id !== "string") throw new Error("Missing inbox");
      await ctx.runMutation(internal.mail.attach, {
        userId,
        inboxId: inbox.inbox_id,
      });
      return inbox.inbox_id;
    } catch {
      await ctx.runMutation(internal.mail.attach, { userId });
      throw new ConvexError(
        "Could not create the inbox. Please try again shortly.",
      );
    }
  },
});
const receivedMessage = z.object({
  inbox_id: z.string(),
  message_id: z.string(),
  subject: z.string().optional(),
  text: z.string().optional(),
  extracted_text: z.string().optional(),
});
export const received = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const parsed = receivedMessage.safeParse(a.message);
    if (!parsed.success) return null;
    if (
      await ctx.db
        .query("mailReceipts")
        .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
        .first()
    )
      return null;
    const m = parsed.data;
    const token = m.subject?.match(/\[TAUT ([a-f0-9]{32})\]/)?.[1];
    const p =
      m.inbox_id === process.env.AGENTMAIL_CAPTURE_INBOX_ID
        ? token
          ? await ctx.db
              .query("profiles")
              .withIndex("by_capture_token", (q) => q.eq("captureToken", token))
              .unique()
          : null
        : await ctx.db
            .query("profiles")
            .withIndex("by_inbox", (q) => q.eq("inboxId", m.inbox_id))
            .unique();
    if (!p) return null;
    // Inbound email remains untrusted source text. It never triggers an AI call or outbound email.
    const content = (m.extracted_text || m.text || "").trim();
    if (!content) return null;
    if (!(await limits.limit(ctx, "capture", { key: p.userId })).ok)
      return null;
    if (!(await limits.limit(ctx, "globalCapture")).ok) return null;
    const requestId = `mail-${m.message_id}`;
    if (
      await ctx.db
        .query("sources")
        .withIndex("by_user_request", (q) =>
          q.eq("userId", p.userId).eq("requestId", requestId),
        )
        .first()
    )
      return null;
    if (
      (
        await ctx.db
          .query("sources")
          .withIndex("by_user", (q) => q.eq("userId", p.userId))
          .take(200)
      ).length >= 200
    )
      return null;
    await ctx.db.insert("sources", {
      userId: p.userId,
      title: (
        m.subject?.replace(/\[TAUT [a-f0-9]{32}\]/g, "").trim() ||
        "A note from your inbox"
      ).slice(0, 180),
      content: "",
      bodyId: await storeBody(ctx, p.userId, content.slice(0, 50000)),
      wordCount: countWords(content.slice(0, 50000)),
      excerpt: content.slice(0, 240),
      kind: "email",
      domain: "Email capture",
      topic: "From your inbox",
      intention: "",
      status: "ready",
      read: false,
      favorite: false,
      requestId,
      capturedAt: Date.now(),
      truncated: content.length > 50000,
    });
    await ctx.db.insert("mailReceipts", {
      eventId: a.eventId,
      userId: p.userId,
    });
    return null;
  },
});
