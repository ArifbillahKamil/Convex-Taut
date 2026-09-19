import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
export function countWords(content: string) {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}
export async function storeBody(
  ctx: MutationCtx,
  userId: Id<"users">,
  content: string,
) {
  return ctx.db.insert("sourceBodies", { userId, content });
}
export async function withBody(
  ctx: QueryCtx | MutationCtx,
  source: Doc<"sources">,
) {
  if (!source.bodyId) return source; // Existing development notes remain readable.
  const body = await ctx.db.get(source.bodyId);
  if (!body || body.userId !== source.userId)
    throw new Error("Source body unavailable");
  return { ...source, content: body.content };
}
