import { describe, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import {
  verifiedCitations,
  evidencePassages,
  resolveEvidence,
} from "./grounding";
import { publicUrl, requireVerified } from "./lib";
const modules = import.meta.glob("./**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const [alice, bob] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { isAnonymous: true }),
    await ctx.db.insert("users", { isAnonymous: true }),
  ]);
  return {
    t,
    alice,
    bob,
    a: t.withIdentity({ subject: `${alice}|session-a` }),
    b: t.withIdentity({ subject: `${bob}|session-b` }),
  };
}
const note = {
  title: "Private source",
  content: "A private explanation of retrieval practice.",
  topic: "Learning",
  intention: "",
  requestId: "note-request",
};
describe("private workspaces", () => {
  it("keeps article bodies out of lists and checks ownership when loading full text", async () => {
    const { t, a, b, alice } = await setup();
    const content = "An original long note. ".repeat(2000);
    const id = await a.mutation(api.library.save, { ...note, content });
    const list = await a.query(api.library.list, {});
    expect(list[0].content).toBe("");
    expect(JSON.stringify(list).length).toBeLessThan(2000);
    expect((await a.query(api.library.get, { id }))?.content).toBe(
      content.trim(),
    );
    expect(await b.query(api.library.get, { id })).toBeNull();
    expect(
      (
        await t.query(internal.library.getContext, { userId: alice, ids: [id] })
      )[0].content,
    ).toBe(content.trim());
    const bodyId = list[0].bodyId!;
    await a.mutation(api.library.remove, { id });
    expect(await t.run((ctx) => ctx.db.get(bodyId))).toBeNull();
  });
  it("routes a shared capture address only by the owner's private subject token", async () => {
    vi.stubEnv("AGENTMAIL_CAPTURE_INBOX_ID", "shared-test");
    try {
      const { t, a, b, alice } = await setup();
      await t.run((ctx) =>
        ctx.db.patch(alice, { emailVerificationTime: Date.now() }),
      );
      const token = "a".repeat(32);
      await t.mutation(internal.mail.enableSharedCapture, {
        userId: alice,
        token,
      });
      const event = {
        message: {
          inbox_id: "shared-test",
          message_id: "shared-message",
          subject: "No code",
          text: "An original test note.",
        },
        thread: {},
        eventId: "shared-event",
      };
      await t.mutation(internal.mail.received, event);
      expect(await a.query(api.library.list, {})).toHaveLength(0);
      event.message.subject = `[TAUT ${"b".repeat(32)}] Wrong code`;
      await t.mutation(internal.mail.received, event);
      expect(await a.query(api.library.list, {})).toHaveLength(0);
      event.message.subject = `[TAUT ${token}] A saved idea`;
      await t.mutation(internal.mail.received, event);
      await t.mutation(internal.mail.received, event);
      const rows = await a.query(api.library.list, {});
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("A saved idea");
      expect(await b.query(api.library.list, {})).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("requires verification before paid features and email inbox creation", async () => {
    const { t, alice } = await setup();
    await expect(t.run((ctx) => requireVerified(ctx, alice))).rejects.toThrow(
      "verified email",
    );
    await expect(
      t.mutation(internal.mail.reserve, { userId: alice }),
    ).rejects.toThrow("verified email");
    await t.run((ctx) =>
      ctx.db.patch(alice, { emailVerificationTime: Date.now() }),
    );
    await expect(
      t.run((ctx) => requireVerified(ctx, alice)),
    ).resolves.toBeNull();
  });
  it("limits repeated authentication requests by normalized account", async () => {
    const { t } = await setup();
    for (let i = 0; i < 10; i++)
      await t.mutation(internal.accounts.reserveAuth, {
        email: "test@example.invalid",
      });
    await expect(
      t.mutation(internal.accounts.reserveAuth, {
        email: "test@example.invalid",
      }),
    ).rejects.toThrow("Too many attempts");
    await expect(
      t.mutation(internal.accounts.reserveAuth, {
        email: "second@example.invalid",
      }),
    ).resolves.toBeNull();
  });
  it("rejects anonymous reads and mutations", async () => {
    const { t } = await setup();
    await expect(t.query(api.library.list, {})).rejects.toThrow();
    await expect(t.mutation(api.library.save, note)).rejects.toThrow();
  });
  it("isolates sources and forbids another user from changing or learning from them", async () => {
    const { a, b, t, bob } = await setup();
    const id = await a.mutation(api.library.save, note);
    expect(await b.query(api.library.list, {})).toEqual([]);
    await expect(
      b.mutation(api.library.update, { id, favorite: true }),
    ).rejects.toThrow("Source unavailable");
    await expect(b.mutation(api.library.remove, { id })).rejects.toThrow(
      "Source unavailable",
    );
    expect(
      await t.query(internal.library.getContext, { userId: bob, ids: [id] }),
    ).toEqual([]);
  });
  it("deduplicates retries and keeps favorite changes idempotent", async () => {
    const { a } = await setup();
    const id = await a.mutation(api.library.save, note);
    expect(await a.mutation(api.library.save, note)).toBe(id);
    await a.mutation(api.library.update, { id, favorite: true });
    await a.mutation(api.library.update, { id, favorite: true });
    const rows = await a.query(api.library.list, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].favorite).toBe(true);
  });
  it("routes inbound mail by inbox, deduplicates it, and does not run AI automatically", async () => {
    const { t, a, b, alice } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("profiles", {
        userId: alice,
        seeded: false,
        inboxId: "test-inbox",
      }),
    );
    const event = {
      message: {
        inbox_id: "test-inbox",
        message_id: "message-one",
        subject: "A sample newsletter",
        text: "This is an original test email, not an outbound message.",
      },
      thread: {},
      eventId: "event-one",
    };
    await t.mutation(internal.mail.received, event);
    await t.mutation(internal.mail.received, event);
    expect(await a.query(api.library.list, {})).toHaveLength(1);
    expect(await b.query(api.library.list, {})).toHaveLength(0);
    expect(await a.query(api.learning.questions, {})).toHaveLength(0);
  });
});
describe("grounded output and URL validation", () => {
  it("resolves only selected source passages and never lets the model supply quotation text", () => {
    const sources = [
      {
        _id: "owned",
        title: "Notes",
        content:
          "Read a section and close the source. Then explain it from memory.\n\nCompare your explanation with the original.",
      },
    ];
    const passages = evidencePassages(sources);
    const result = resolveEvidence(sources, [
      passages[0].ref,
      "foreign:0",
      passages[0].ref,
    ]);
    expect(result).toHaveLength(1);
    expect(sources[0].content).toContain(result[0].quote);
    expect(result[0].sourceId).toBe("owned");
  });
  it("discards fabricated IDs, non-source quotations, and duplicate evidence", () => {
    const sources = [
      {
        _id: "real",
        title: "A source",
        content: "Close the source and explain the idea in your own words.",
      },
    ];
    const result = verifiedCitations(sources, [
      { sourceId: "fake", quote: sources[0].content },
      { sourceId: "real", quote: "This quotation was never in the source." },
      { sourceId: "real", quote: "Close the source and explain the idea" },
      { sourceId: "real", quote: "Close the source and explain the idea" },
    ]);
    expect(result).toEqual([
      {
        sourceId: "real",
        title: "A source",
        quote: "Close the source and explain the idea",
      },
    ]);
  });
  it("blocks local addresses, credentials, custom ports and non-HTTPS URLs", () => {
    for (const url of [
      "http://example.com",
      "https://127.0.0.1",
      "https://[::1]",
      "https://user:pass@example.com",
      "https://example.com:8443",
      "https://foo.internal",
      "https://localhost",
    ])
      expect(() => publicUrl(url)).toThrow();
    expect(publicUrl("https://example.com/read#section").toString()).toBe(
      "https://example.com/read",
    );
  });
});
