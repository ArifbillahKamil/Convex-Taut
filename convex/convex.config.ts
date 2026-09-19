import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import agentmail from "@agentmail/convex/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";

const app = defineApp();
app.use(agent);
app.use(workflow);
app.use(rateLimiter);
app.use(agentmail);
app.use(staticHosting);
export default app;
