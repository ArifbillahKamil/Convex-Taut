import { parseEnv } from "node:util";

export const parseEnvironment = (text) => parseEnv(text.replace(/^\uFEFF/, ""));

export function agentMailBaseUrl(value = "https://api.agentmail.to/v0") {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !["api.agentmail.to", "api.agentmail.eu"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !["/v0", "/v0/"].includes(url.pathname)
  ) {
    throw new Error(
      "AGENTMAIL_BASE_URL must be an official AgentMail /v0 endpoint.",
    );
  }
  return url.toString().replace(/\/$/, "");
}

export function publicSiteUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.convex\.site$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Use the selected deployment's exact https://<name>.convex.site URL.",
    );
  }
  return url.origin;
}

export function redact(value, secrets = []) {
  let text = String(value);
  for (const secret of secrets
    .filter(Boolean)
    .sort((a, b) => b.length - a.length))
    text = text.replaceAll(secret, "[redacted]");
  return text
    .replace(/\b(?:am_|whsec_|sk-proj-)[A-Za-z0-9_=-]+/g, "[redacted]")
    .replace(/[\w.+%-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted address]")
    .slice(0, 1800);
}

export class AgentMailRequestError extends Error {
  constructor(status, payload, secrets = []) {
    const info = { status };
    for (const field of ["name", "code", "message", "fix", "docs"]) {
      if (typeof payload?.[field] === "string")
        info[field] = redact(payload[field], secrets);
    }
    super(`AgentMail request rejected: ${JSON.stringify(info)}`);
    this.name = "AgentMailRequestError";
    this.status = status;
    this.info = info;
  }
}

export function createAgentMailClient({
  key,
  baseUrl,
  secrets = [],
  fetchImpl = fetch,
}) {
  if (!key?.trim()) throw new Error("AGENTMAIL_API_KEY is missing.");
  if (/\s/.test(key))
    throw new Error(
      "AGENTMAIL_API_KEY contains whitespace; check its local formatting.",
    );
  const base = agentMailBaseUrl(baseUrl);
  return async function request(path, { method = "GET", body } = {}) {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("Invalid AgentMail API path.");
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new AgentMailRequestError(response.status, payload, [
        key,
        ...secrets,
      ]);
    return payload;
  };
}

export async function ensureWebhook(request, site) {
  const url = `${publicSiteUrl(site)}/agentmail/webhook`;
  let pageToken;
  for (let page = 0; page < 20; page++) {
    let result;
    try {
      result = await request(
        `/webhooks?limit=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`,
      );
    } catch (error) {
      // Creation and listing are separate permissions. Do not broaden the key.
      if (error instanceof AgentMailRequestError && error.status === 403) break;
      throw error;
    }
    const existing = result.webhooks?.find((w) => w.url === url);
    if (existing) {
      if (
        !existing.enabled ||
        !existing.event_types?.includes("message.received")
      )
        throw new Error(
          "The matching webhook exists but is disabled or lacks message.received. Correct this endpoint's settings before activation.",
        );
      const webhook = existing.secret
        ? existing
        : await request(`/webhooks/${encodeURIComponent(existing.webhook_id)}`);
      if (!webhook.secret)
        throw new Error("AgentMail did not return the webhook signing secret.");
      return webhook;
    }
    pageToken = result.next_page_token;
    if (!pageToken) break;
    if (page === 19)
      throw new Error(
        "Webhook listing exceeded the bounded lookup. Configure the signing secret explicitly.",
      );
  }
  const webhook = await request("/webhooks", {
    method: "POST",
    body: {
      url,
      event_types: ["message.received"],
      client_id: `taut-${new URL(site).hostname}`,
    },
  });
  if (!webhook.secret)
    throw new Error("AgentMail did not return the webhook signing secret.");
  return webhook;
}
