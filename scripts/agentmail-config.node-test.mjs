import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AgentMailRequestError,
  agentMailBaseUrl,
  createAgentMailClient,
  ensureWebhook,
  parseEnvironment,
  publicSiteUrl,
} from "./agentmail-config.mjs";

test("env parsing handles quotes, whitespace and comments", () => {
  const parsed = parseEnvironment(
    '\uFEFFAGENTMAIL_API_KEY = "am_fixture" # comment\nAGENTMAIL_WEBHOOK_SECRET=whsec_fixture\n',
  );
  assert.equal(parsed.AGENTMAIL_API_KEY, "am_fixture");
  assert.equal(parsed.AGENTMAIL_WEBHOOK_SECRET, "whsec_fixture");
});
test("credentials can only be sent to approved AgentMail hosts", () => {
  assert.equal(agentMailBaseUrl(), "https://api.agentmail.to/v0");
  assert.equal(
    agentMailBaseUrl("https://api.agentmail.eu/v0/"),
    "https://api.agentmail.eu/v0",
  );
  for (const value of [
    "https://example.com/v0",
    "http://api.agentmail.to/v0",
    "https://api.agentmail.to/v0?token=x",
    "https://user:pass@api.agentmail.to/v0",
  ])
    assert.throws(() => agentMailBaseUrl(value));
  assert.equal(
    publicSiteUrl("https://demo-123.convex.site"),
    "https://demo-123.convex.site",
  );
  assert.throws(() =>
    publicSiteUrl("https://demo-123.convex.site/another-app"),
  );
});
test("structured 403 preserves the cause without revealing credentials", async () => {
  const request = createAgentMailClient({
    key: "am_fixture",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          name: "ForbiddenError",
          code: "missing_permission",
          message: "Forbidden",
          fix: "webhook_create is required; key am_fixture",
        }),
        { status: 403 },
      ),
  });
  await assert.rejects(
    () => request("/webhooks"),
    (error) => {
      assert.ok(error instanceof AgentMailRequestError);
      assert.equal(error.info.code, "missing_permission");
      assert.match(error.info.fix, /webhook_create/);
      assert.ok(!error.message.includes("am_fixture"));
      return true;
    },
  );
});
test("existing exact endpoint is reused instead of duplicated", async () => {
  const calls = [],
    target = "https://demo-123.convex.site";
  const request = async (path) => {
    calls.push(path);
    return {
      webhooks: [
        {
          webhook_id: "existing",
          url: `${target}/agentmail/webhook`,
          enabled: true,
          event_types: ["message.received"],
          secret: "fixture-secret",
        },
      ],
    };
  };
  assert.equal((await ensureWebhook(request, target)).webhook_id, "existing");
  assert.equal(calls.length, 1);
});
test("unrelated webhook is not reused for this deployment", async () => {
  const request = async (path, options) => {
    if (!options)
      return {
        webhooks: [
          {
            url: "https://other-456.convex.site/agentmail/webhook",
            secret: "not-ours",
          },
        ],
      };
    assert.equal(path, "/webhooks");
    assert.equal(
      options.body.url,
      "https://demo-123.convex.site/agentmail/webhook",
    );
    assert.deepEqual(options.body.event_types, ["message.received"]);
    return { webhook_id: "created", secret: "fixture-secret" };
  };
  assert.equal(
    (await ensureWebhook(request, "https://demo-123.convex.site")).webhook_id,
    "created",
  );
});
