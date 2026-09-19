import { v, ConvexError } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { limits, requireUser } from "./lib";
export const reserveAuth = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    const result = await limits.limit(ctx, "auth", { key: email });
    if (!result.ok)
      throw new ConvexError("Too many attempts. Please wait a few minutes.");
    await limits.limit(ctx, "globalAuth", { throws: true });
    return null;
  },
});
export const reserveEmail = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    await limits.limit(ctx, "authEmail", { key: email, throws: true });
    await limits.limit(ctx, "globalEmail", { throws: true });
    return null;
  },
});
export const current = query({
  args: {},
  returns: v.object({
    email: v.union(v.string(), v.null()),
    verified: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await ctx.db.get(await requireUser(ctx));
    return {
      email: user?.email ?? null,
      verified: !!user?.emailVerificationTime,
    };
  },
});
