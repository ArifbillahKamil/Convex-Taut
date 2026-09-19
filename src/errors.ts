import { ConvexError } from "convex/values";
export function errorText(
  error: unknown,
  fallback = "Something interrupted that request. Please try again.",
) {
  if (!(error instanceof ConvexError)) return fallback;
  if (typeof error.data === "string") return error.data;
  const data = error.data as { kind?: string; retryAfter?: number } | null;
  if (data?.kind === "RateLimited") {
    const minutes = Math.max(1, Math.ceil((data.retryAfter ?? 60000) / 60000));
    return minutes >= 60
      ? `The usage limit has been reached. Try again in about ${Math.ceil(minutes / 60)} hours. Your saved work is safe.`
      : `Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} before trying again.`;
  }
  return fallback;
}
