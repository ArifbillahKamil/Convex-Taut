import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  AgentMailRequestError,
  createAgentMailClient,
  parseEnvironment,
} from "./agentmail-config.mjs";

const { values } = parseArgs({
  options: { "env-file": { type: "string", default: ".env.secrets.local" } },
});
const vars = parseEnvironment(await readFile(values["env-file"], "utf8"));
const key = vars.AGENTMAIL_API_KEY;
console.log(
  JSON.stringify({
    apiKeyPresent: !!key,
    expectedKeyPrefix: key?.startsWith("am_") ?? false,
    webhookSecretPresent: !!vars.AGENTMAIL_WEBHOOK_SECRET,
  }),
);
if (!key) process.exit(1);
const request = createAgentMailClient({
  key,
  baseUrl: vars.AGENTMAIL_BASE_URL,
  secrets: Object.values(vars),
});
let failed = false;
await Promise.all(
  ["inboxes", "webhooks"].map(async (endpoint) => {
    try {
      await request("/" + endpoint + "?limit=1");
      console.log(JSON.stringify({ endpoint, status: 200 }));
    } catch (error) {
      failed = true;
      console.log(
        JSON.stringify({
          endpoint,
          ...(error instanceof AgentMailRequestError
            ? error.info
            : {
                error:
                  "Network request failed; no provider response available.",
              }),
        }),
      );
    }
  }),
);
process.exitCode = failed ? 1 : 0;
