import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import {
  agentMailBaseUrl,
  createAgentMailClient,
  ensureWebhook,
  parseEnvironment,
  publicSiteUrl,
  redact,
} from "./agentmail-config.mjs";

const { values } = parseArgs({
  options: {
    prod: { type: "boolean", default: false },
    "site-url": { type: "string" },
    "env-file": { type: "string", default: ".env.secrets.local" },
    "skip-mail": { type: "boolean", default: false },
    "initialize-auth": { type: "boolean", default: false },
  },
});
if (values.prod && !values["site-url"])
  throw new Error(
    "Production configuration requires --site-url with the verified production deployment URL.",
  );
const secrets = parseEnvironment(await readFile(values["env-file"], "utf8"));
const env = parseEnvironment(await readFile(".env.local", "utf8"));
const defaultSite =
  env.VITE_CONVEX_SITE_URL ||
  env.VITE_CONVEX_URL?.replace(".convex.cloud", ".convex.site");
const site = publicSiteUrl(values["site-url"] || defaultSite);
if (!values.prod && site !== publicSiteUrl(defaultSite))
  throw new Error(
    "The site URL does not match this project's development deployment.",
  );
const deploymentFlags = values.prod ? ["--prod"] : [];
const baseUrl = agentMailBaseUrl(secrets.AGENTMAIL_BASE_URL);
const stateDirectory = ".local/deployments/" + new URL(site).hostname;
console.log(
  "Configuring " + (values.prod ? "production" : "development") + ": " + site,
);

function set(name, value) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/convex/bin/main.js",
      "env",
      "set",
      name + "=" + value,
      ...deploymentFlags,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0)
    throw new Error(
      "Could not set " + name + "; command output withheld to protect secrets.",
    );
  console.log(name + ": configured");
}
await mkdir(stateDirectory, { recursive: true });
const authPath = stateDirectory + "/auth-keys.json";
let keys;
try {
  keys = JSON.parse(await readFile(authPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT")
    throw new Error(
      "Existing auth state could not be read; refusing to rotate credentials.",
    );
  if (!values.prod) {
    try {
      keys = JSON.parse(await readFile(".local/auth-keys.json", "utf8"));
    } catch (legacyError) {
      if (legacyError.code !== "ENOENT")
        throw new Error(
          "Existing development auth state is unreadable; refusing to rotate credentials.",
        );
    }
  }
  if (!keys) {
    if (values.prod && !values["initialize-auth"])
      throw new Error(
        "No local production auth state. Inspect the deployment first; only use --initialize-auth for a verified new deployment.",
      );
    const pair = await generateKeyPair("RS256", { extractable: true });
    const jwk = await exportJWK(pair.publicKey);
    jwk.use = "sig";
    keys = {
      JWT_PRIVATE_KEY: (await exportPKCS8(pair.privateKey))
        .trim()
        .replace(/\n/g, " "),
      JWKS: JSON.stringify({ keys: [jwk] }),
    };
  }
  await writeFile(authPath, JSON.stringify(keys));
}
if (!keys.JWT_PRIVATE_KEY || !keys.JWKS)
  throw new Error("Auth key cache is incomplete; configuration stopped.");
for (const name of [
  "OPENAI_API_KEY",
  "FIRECRAWL_API_KEY",
  "AGENTMAIL_API_KEY",
]) {
  if (secrets[name]) set(name, secrets[name]);
  else console.log(name + ": missing");
}
if (secrets.OPENAI_MODEL) set("OPENAI_MODEL", secrets.OPENAI_MODEL);
set("AGENTMAIL_BASE_URL", baseUrl);
set("JWT_PRIVATE_KEY", keys.JWT_PRIVATE_KEY);
set("JWKS", keys.JWKS);
set("SITE_URL", site);

if (!values["skip-mail"] && secrets.AGENTMAIL_API_KEY) {
  try {
    const request = createAgentMailClient({
      key: secrets.AGENTMAIL_API_KEY,
      baseUrl,
      secrets: Object.values(secrets),
    });
    let cachedSender;
    for (const path of [
      ".local/shared-mail-sender.json",
      stateDirectory + "/auth-inbox.json",
    ]) {
      try {
        cachedSender = JSON.parse(await readFile(path, "utf8"));
        break;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const senderId = secrets.AGENTMAIL_AUTH_INBOX_ID || cachedSender?.inbox_id;
    const inbox = senderId
      ? await request(`/inboxes/${encodeURIComponent(senderId)}`)
      : await request("/inboxes", {
          method: "POST",
          body: {
            display_name: "Taut account verification",
            client_id: `taut-auth-${new URL(site).hostname}`,
          },
        });
    if (typeof inbox.inbox_id !== "string")
      throw new Error("Auth inbox creation returned no identifier.");
    await writeFile(
      stateDirectory + "/auth-inbox.json",
      JSON.stringify({ inbox_id: inbox.inbox_id }),
    );
    set("AGENTMAIL_AUTH_INBOX_ID", inbox.inbox_id);
    await writeFile(
      ".local/shared-mail-sender.json",
      JSON.stringify({ inbox_id: inbox.inbox_id }),
    );
    set("AGENTMAIL_CAPTURE_INBOX_ID", inbox.inbox_id);
    set("AGENTMAIL_CAPTURE_ADDRESS", inbox.email || inbox.inbox_id);
  } catch (error) {
    console.error(redact(error.message, Object.values(secrets)));
    process.exitCode = 1;
  }
  if (secrets.AGENTMAIL_WEBHOOK_SECRET) {
    set("AGENTMAIL_WEBHOOK_SECRET", secrets.AGENTMAIL_WEBHOOK_SECRET);
    console.log(
      "Explicit signing secret configured. Live delivery still needs verification.",
    );
  } else {
    try {
      const request = createAgentMailClient({
        key: secrets.AGENTMAIL_API_KEY,
        baseUrl,
        secrets: Object.values(secrets),
      });
      const webhook = await ensureWebhook(request, site);
      await writeFile(
        stateDirectory + "/mail-webhook.json",
        JSON.stringify(webhook),
      );
      set("AGENTMAIL_WEBHOOK_SECRET", webhook.secret);
      console.log(
        "Webhook configured for this deployment. Live delivery still needs verification.",
      );
    } catch (error) {
      console.error(redact(error.message, Object.values(secrets)));
      console.error(
        "Email setup is incomplete. Existing application data and webhook configurations were not deleted.",
      );
      process.exitCode = 1;
    }
  }
}
if (!process.exitCode)
  console.log(
    "Server configuration complete; this does not publish or verify a production release.",
  );
