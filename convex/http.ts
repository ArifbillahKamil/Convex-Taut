import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { mailClient } from "./mail";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
const http = httpRouter();
auth.addHttpRoutes(http);
http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!process.env.AGENTMAIL_WEBHOOK_SECRET)
      return new Response("Not configured", { status: 503 });
    // AgentMail types its runner as MutationCtx; this action adapter deliberately
    // forwards only the function and arguments, not transaction-only options.
    return mailClient.handleWebhook(
      { runMutation: (fn, ...args) => ctx.runMutation(fn, args[0]) },
      req,
    );
  }),
});
registerStaticRoutes(http, components.staticHosting);
export default http;
