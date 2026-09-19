import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const sourceFields = {
  userId: v.id("users"),
  title: v.string(),
  content: v.string(),
  excerpt: v.string(),
  kind: v.union(v.literal("article"), v.literal("note"), v.literal("email")),
  url: v.optional(v.string()),
  domain: v.string(),
  topic: v.string(),
  intention: v.string(),
  status: v.union(
    v.literal("processing"),
    v.literal("ready"),
    v.literal("error"),
  ),
  error: v.optional(v.string()),
  read: v.boolean(),
  favorite: v.boolean(),
  requestId: v.string(),
  capturedAt: v.number(),
  sample: v.optional(v.boolean()),
  truncated: v.optional(v.boolean()),
};
export const citationValidator = v.object({
  sourceId: v.id("sources"),
  title: v.string(),
  quote: v.string(),
});
export const sessionFields = {
  userId: v.id("users"),
  goal: v.string(),
  sourceIds: v.array(v.id("sources")),
  threadId: v.string(),
  state: v.union(
    v.literal("active"),
    v.literal("paused"),
    v.literal("completed"),
  ),
  busy: v.boolean(),
  pendingAt: v.optional(v.number()),
  activeRequestId: v.optional(v.string()),
  updatedAt: v.number(),
  requestId: v.string(),
  lastQuestion: v.string(),
  preview: v.string(),
  turnCount: v.number(),
  error: v.optional(v.string()),
};
export default defineSchema({
  ...authTables,
  profiles: defineTable({
    userId: v.id("users"),
    seeded: v.boolean(),
    inboxId: v.optional(v.string()),
    inboxCreating: v.optional(v.boolean()),
    inboxStartedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_inbox", ["inboxId"]),
  sources: defineTable(sourceFields)
    .index("by_user", ["userId"])
    .index("by_user_request", ["userId", "requestId"])
    .index("by_user_kind", ["userId", "kind"])
    .index("by_user_favorite", ["userId", "favorite"])
    .index("by_user_url", ["userId", "url"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["userId", "status"],
    })
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId"],
    }),
  sessions: defineTable(sessionFields)
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_user_request", ["userId", "requestId"]),
  turns: defineTable({
    userId: v.id("users"),
    sessionId: v.id("sessions"),
    requestId: v.string(),
    prompt: v.string(),
    answer: v.string(),
    citations: v.array(citationValidator),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_request", ["sessionId", "requestId"]),
  questions: defineTable({
    userId: v.id("users"),
    text: v.string(),
    answer: v.string(),
    citations: v.array(citationValidator),
    status: v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("error"),
    ),
    error: v.optional(v.string()),
    requestId: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_request", ["userId", "requestId"]),
  mailReceipts: defineTable({
    eventId: v.string(),
    userId: v.id("users"),
  }).index("by_event", ["eventId"]),
});
