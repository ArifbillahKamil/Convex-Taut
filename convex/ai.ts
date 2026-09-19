import { v } from "convex/values";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { Agent } from "@convex-dev/agent";
import { internalAction } from "./_generated/server";
import { components, internal } from "./_generated/api";
import {
  groundingInstructions,
  sourceContext,
  evidencePassages,
  resolveEvidence,
  type GroundSource,
} from "./grounding";

function answerSchema(sources: GroundSource[]) {
  const refs = evidencePassages(sources).map((p) => p.ref);
  if (!refs.length)
    throw new Error("Not enough source text to ground an answer");
  return z.object({
    answer: z.string(),
    citationRefs: z
      .array(z.enum(refs as [string, ...string[]]))
      .max(5)
      .describe(
        "Choose the supplied passage refs that support this answer. Include evidence again on every feedback turn. Empty only if the sources cannot support an answer.",
      ),
  });
}
const model = () => openai.chat(process.env.OPENAI_MODEL || "gpt-4.1-mini");
const noEvidence =
  "I could not verify an answer against the selected sources. Try another question or add a source that covers it.";
export const answer = internalAction({
  args: {
    id: v.id("questions"),
    userId: v.id("users"),
    text: v.string(),
    sourceIds: v.array(v.id("sources")),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    try {
      const sources = await ctx.runQuery(internal.library.getContext, {
        userId: a.userId,
        ids: a.sourceIds,
      });
      if (!sources.length) throw new Error("No sources");
      const { object } = await generateObject({
        model: model(),
        schema: answerSchema(sources),
        system: groundingInstructions,
        prompt: `SOURCE DATA:\n${sourceContext(sources)}\nUSER QUESTION:\n${a.text}`,
        maxOutputTokens: 1400,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(85000),
      });
      const citations = resolveEvidence(sources, object.citationRefs);
      await ctx.runMutation(internal.learning.finishQuestion, {
        id: a.id,
        answer: citations.length ? object.answer : noEvidence,
        citations,
      });
    } catch {
      await ctx.runMutation(internal.learning.finishQuestion, {
        id: a.id,
        answer: "",
        citations: [],
        error:
          "The AI service could not answer. Your sources are safe. Try again shortly.",
      });
    }
    return null;
  },
});
export const coach = internalAction({
  args: { id: v.id("sessions"), requestId: v.string(), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    try {
      const session = await ctx.runQuery(internal.learning.getSession, {
        id: a.id,
      });
      if (!session || !session.busy || session.activeRequestId !== a.requestId)
        return null;
      const sources = await ctx.runQuery(internal.library.getContext, {
        userId: session.userId,
        ids: session.sourceIds,
      });
      if (!sources.length) throw new Error("Sources removed");
      const tutor = new Agent(components.agent, {
        name: "Taut learning companion",
        languageModel: model(),
        instructions:
          groundingInstructions +
          "\nTeach one small idea at a time. On the first turn explain one useful idea then ask one practice question. On later turns assess the learner response against the source, gently correct misconceptions, and ask one next question. If asked to explain instead, help without forcing a quiz. Honor the learning goal. Never grade with invented scores.",
        contextOptions: { recentMessages: 12, searchOtherThreads: false },
      });
      const { object } = await tutor.generateObject(
        ctx,
        { threadId: session.threadId, userId: session.userId },
        {
          schema: answerSchema(sources).extend({ question: z.string() }),
          prompt: `LEARNING GOAL: ${session.goal}\nSOURCE DATA:\n${sourceContext(sources)}\nLEARNER: ${a.prompt}`,
          maxOutputTokens: 1600,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(85000),
        },
      );
      const citations = resolveEvidence(sources, object.citationRefs);
      await ctx.runMutation(internal.learning.finishTurn, {
        ...a,
        answer: citations.length ? object.answer : noEvidence,
        question: citations.length ? object.question : "",
        citations,
      });
    } catch {
      await ctx.runMutation(internal.learning.finishTurn, {
        ...a,
        answer: "",
        question: "",
        citations: [],
        error:
          "Your learning companion could not respond. Check the connection and try again; your place is saved.",
      });
    }
    return null;
  },
});
