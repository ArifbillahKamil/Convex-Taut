import { defineWorkflow } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { publicUrl } from "./lib";

export const fetchPage = internalAction({
  args: { url: v.string() },
  returns: v.object({ title: v.string(), content: v.string() }),
  handler: async (_ctx, { url }) => {
    if (!process.env.FIRECRAWL_API_KEY)
      throw new Error("Link import is not connected.");
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: publicUrl(url).toString(),
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 30000,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new Error("The page could not be imported.");
    const body = await response.json();
    if (
      !body.success ||
      typeof body.data?.markdown !== "string" ||
      !body.data.markdown.trim()
    )
      throw new Error("No readable content found.");
    return {
      title: String(body.data.metadata?.title || new URL(url).hostname).slice(
        0,
        180,
      ),
      content: body.data.markdown.slice(0, 50001),
    };
  },
});
export const importPage = defineWorkflow(components.workflow, {
  args: { sourceId: v.id("sources"), url: v.string() },
  returns: v.null(),
}).handler(async (step, { sourceId, url }): Promise<null> => {
  try {
    const page = await step.runAction(
      internal.ingest.fetchPage,
      { url },
      { retry: { maxAttempts: 2, initialBackoffMs: 2000, base: 2 } },
    );
    await step.runMutation(internal.library.imported, {
      id: sourceId,
      ...page,
    });
  } catch {
    await step.runMutation(internal.library.imported, {
      id: sourceId,
      error:
        "We could not read this page. It may block imports. Save its text as a note, or remove it and try again.",
    });
  }
  return null;
});
