import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { RateLimiter, MINUTE, DAY } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export async function requireUser(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const id = await getAuthUserId(ctx);
  if (!id) throw new ConvexError("Please open your personal space first.");
  return id;
}
export const limits = new RateLimiter(components.rateLimiter, {
  auth: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 10 },
  globalAuth: { kind: "fixed window", rate: 2000, period: DAY },
  authEmail: { kind: "token bucket", rate: 1, period: MINUTE, capacity: 1 },
  globalEmail: { kind: "fixed window", rate: 200, period: DAY },
  userAI: { kind: "fixed window", rate: 30, period: DAY },
  userImport: { kind: "fixed window", rate: 20, period: DAY },
  globalImport: { kind: "fixed window", rate: 100, period: DAY },
  capture: { kind: "fixed window", rate: 50, period: DAY },
  globalCapture: { kind: "fixed window", rate: 1000, period: DAY },
  ai: { kind: "token bucket", rate: 6, period: MINUTE, capacity: 3 },
  save: { kind: "token bucket", rate: 12, period: MINUTE, capacity: 5 },
  globalAI: { kind: "fixed window", rate: 200, period: DAY },
  inbox: { kind: "fixed window", rate: 20, period: DAY },
});
export async function requireVerified(
  ctx: QueryCtx | MutationCtx,
  userId: import("./_generated/dataModel").Id<"users">,
) {
  const user = await ctx.db.get(userId);
  if (!user?.emailVerificationTime)
    throw new ConvexError(
      "Sign in with a verified email account to use this feature.",
    );
}
export function cleanText(value: string, max: number, label: string) {
  const text = value.trim();
  if (!text || text.length > max)
    throw new ConvexError(
      `${label} must be between 1 and ${max.toLocaleString()} characters.`,
    );
  return text;
}
export function publicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConvexError("Enter a complete https:// URL.");
  }
  const h = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !h.includes(".") ||
    h === "localhost" ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(h) ||
    /^[\d.]+$/.test(h) ||
    h.includes(":")
  )
    throw new ConvexError("Use a public HTTPS website address.");
  url.hash = "";
  return url;
}
