import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  createAgentMailClient,
  parseEnvironment,
} from "./agentmail-config.mjs";
const secrets = parseEnvironment(await readFile(".env.secrets.local", "utf8"));
const request = createAgentMailClient({
  key: secrets.AGENTMAIL_API_KEY,
  baseUrl: secrets.AGENTMAIL_BASE_URL,
});
const test = JSON.parse(
  await readFile(".local/verified-test-account.json", "utf8"),
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    storageState: ".local/verified-session.json",
  });
  const page = await context.newPage();
  await page.goto(test.url);
  await Promise.race([
    page.getByRole("button", { name: "Space settings" }).waitFor(),
    page.getByRole("button", { name: "Create my account" }).waitFor(),
  ]);
  if (await page.getByRole("button", { name: "Create my account" }).count()) {
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await page.getByLabel("Email", { exact: true }).fill(test.email);
    await page.getByLabel("Password", { exact: true }).fill(test.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await page.getByRole("button", { name: "Space settings" }).click();
  const enable = page.getByRole("button", { name: "Enable email capture" });
  if (await enable.count()) await enable.click();
  await page.locator(".capture-code code").waitFor({ timeout: 30000 });
  const subjectCode = await page.locator(".capture-code code").innerText();
  const capture = await page.locator(".inbox-address code").innerText();
  await page.screenshot({
    path: ".local/screenshots/mail-settings.png",
    fullPage: true,
    mask: [
      page.locator(".inbox-address"),
      page.locator(".capture-code"),
      page.locator("dialog > .muted"),
    ],
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  const marker = `Delivery check ${Date.now()}`;
  await request(`/inboxes/${encodeURIComponent(test.email)}/messages/send`, {
    method: "POST",
    body: {
      to: [capture],
      subject: `${subjectCode} ${marker}`,
      text: "A test email between project-owned inboxes: retrieve an idea, then compare it with its source.",
    },
  });
  await page
    .locator(".source-open")
    .filter({ hasText: marker })
    .waitFor({ timeout: 60000 });
  console.log(
    "PASS: real AgentMail delivery routes the shared inbox to the verified owner's library",
  );
  await context.storageState({ path: ".local/verified-session.json" });
} finally {
  await browser.close();
}
