import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  createAgentMailClient,
  parseEnvironment,
} from "./agentmail-config.mjs";
const secrets = parseEnvironment(await readFile(".env.secrets.local", "utf8"));
const request = createAgentMailClient({
  key: secrets.AGENTMAIL_API_KEY,
  baseUrl: secrets.AGENTMAIL_BASE_URL,
});
const url = process.env.TAUT_TEST_URL || "http://127.0.0.1:5173";
const existing = await request("/inboxes?limit=100");
const inbox =
  existing.inboxes?.find(
    (inbox) =>
      inbox.client_id?.startsWith("taut-test-") &&
      inbox.display_name === "Taut automated account test",
  ) ||
  (await request("/inboxes", {
    method: "POST",
    body: {
      display_name: "Taut automated account test",
      client_id: `taut-test-${randomUUID()}`,
    },
  }));
const email = inbox.inbox_id;
const oldMessages = new Set(
  (
    await request(`/inboxes/${encodeURIComponent(email)}/messages?limit=100`)
  ).messages?.map((message) => message.message_id),
);
let password = randomUUID() + "Aa!";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir(".local/screenshots", { recursive: true });
async function getCode(purpose) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const messages = await request(
      `/inboxes/${encodeURIComponent(email)}/messages?limit=10`,
    );
    const message = messages.messages?.find(
      (m) => !oldMessages.has(m.message_id) && m.subject?.includes(purpose),
    );
    const code = message?.subject?.match(/^([0-9A-F]{10}) /)?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error(
    "Verification email did not arrive in the project's test inbox.",
  );
}
try {
  await page.goto(url);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.screenshot({
    path: ".local/screenshots/auth-desktop.png",
    fullPage: true,
    mask: [page.locator("input")],
  });
  await page.getByRole("button", { name: "Create my account" }).click();
  await page.getByLabel("Email code").waitFor({ timeout: 30000 });
  if (await page.getByRole("button", { name: "Save something" }).count())
    throw new Error("Unverified signup entered workspace");
  await page.getByLabel("Email code").fill(await getCode("Email verification"));
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore sample library" })
    .waitFor({ timeout: 30000 });
  console.log("PASS: real AgentMail verification, verified account sign-up");
  if (!process.env.TAUT_SKIP_CAPTURE) {
    await page.getByRole("button", { name: "Space settings" }).click();
    await page.getByRole("button", { name: "Enable email capture" }).click();
    await page.locator(".inbox-address code").waitFor({ timeout: 30000 });
    const capture = await page.locator(".inbox-address code").innerText();
    const subjectCode = await page.locator(".capture-code code").innerText();
    await page.getByRole("button", { name: "Close dialog" }).click();
    // Both sender and recipient were created specifically by this test.
    await request(`/inboxes/${encodeURIComponent(email)}/messages/send`, {
      method: "POST",
      body: {
        to: [capture],
        subject: `${subjectCode} Taut delivery verification`,
        text: "An original test note: recall an idea from memory, then check it against its source.",
      },
    });
    await page
      .locator(".source-open")
      .filter({ hasText: "Taut delivery verification" })
      .waitFor({ timeout: 60000 });
    console.log(
      "PASS: real email delivery through signed webhook into the owner's library",
    );
  }
  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto(url);
  await other.getByRole("button", { name: "Back to sign in" }).click();
  await other.getByLabel("Email", { exact: true }).fill(email);
  await other.getByLabel("Password", { exact: true }).fill(password);
  await other.getByRole("button", { name: "Sign in", exact: true }).click();
  await other
    .getByRole("button", { name: "Save something" })
    .waitFor({ timeout: 30000 });
  console.log("PASS: separate browser session signs into the same collection");
  await other.getByRole("button", { name: "Space settings" }).click();
  await other.getByRole("button", { name: "Sign out", exact: true }).click();
  await other.getByRole("button", { name: "Back to sign in" }).click();
  await other.getByRole("button", { name: "Forgot password?" }).click();
  await other.getByLabel("Email", { exact: true }).fill(email);
  // Respect the real provider's one-email-per-minute budget.
  await new Promise((resolve) => setTimeout(resolve, 61000));
  await other.getByRole("button", { name: "Send reset code" }).click();
  await other.getByLabel("Email code").waitFor();
  await other.getByLabel("Email code").fill(await getCode("Password reset"));
  password = randomUUID() + "Bb!";
  await other.getByLabel("New password").fill(password);
  await other
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await other
    .getByRole("button", { name: "Save something" })
    .waitFor({ timeout: 30000 });
  await second.storageState({ path: ".local/verified-session.json" });
  await writeFile(
    ".local/verified-test-account.json",
    JSON.stringify({ url, email, password }),
  );
  console.log("PASS: real email password recovery preserves the collection");
  await other.setViewportSize({ width: 390, height: 844 });
  if (
    await other.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )
  )
    throw new Error("Mobile overflow");
  if (errors.length) throw new Error("Browser runtime errors occurred");
  console.log("PASS: mobile account workspace, no browser runtime errors");
} finally {
  await browser.close();
}
