import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir(".local/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  storageState: ".local/verified-session.json",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.TAUT_TEST_URL || "http://127.0.0.1:5173");
await page.getByRole("button", { name: "Save something" }).waitFor({ timeout: 30000 });
// The authentication test already captured an email, so reveal the empty search
// state before adding sample notes through the normal user interface.
await page.getByRole("textbox", { name: "Search saved sources" }).fill("unmatchedseedfixture");
await page.screenshot({
  path: ".local/screenshots/welcome-desktop.png",
  fullPage: true,
});
await page
  .getByRole("button", { name: "Explore sample library" })
  .waitFor({ timeout: 30000 });
await page.getByRole("button", { name: "Explore sample library" }).click();
await page.getByRole("button", { name: "Clear search" }).click();
await page
  .locator(".source-open")
  .filter({ hasText: "A small guide to paying attention" })
  .waitFor();
await page.screenshot({
  path: ".local/screenshots/library-desktop.png",
  fullPage: true,
});
console.log("PASS: verified auth, real Convex seed, reactive library");
await page.getByRole("button", { name: "Save something" }).click();
await page.getByRole("button", { name: "A personal note" }).click();
await page
  .getByLabel("Title", { exact: true })
  .fill("A tiny learning experiment");
await page
  .getByLabel("Your note")
  .fill(
    "My experiment is to read for ten minutes, close the source, and write three sentences from memory. Then I compare my explanation with the original and keep one question for tomorrow.",
  );
await page.getByLabel("Collection").fill("Learning");
await page.getByRole("button", { name: "Save to my library" }).click();
await page
  .locator(".source-open")
  .filter({ hasText: "A tiny learning experiment" })
  .waitFor();
await page.reload();
await page
  .locator(".source-open")
  .filter({ hasText: "A tiny learning experiment" })
  .waitFor();
console.log("PASS: create note and authenticated persistence after reload");
await page
  .getByRole("button", {
    name: "Favorite A tiny learning experiment",
    exact: true,
  })
  .click();
await page.getByRole("button", { name: "Favorites", exact: true }).click();
await page
  .locator(".source-open")
  .filter({ hasText: "A tiny learning experiment" })
  .waitFor();
console.log("PASS: favorites");
await page.getByRole("button", { name: "Ask my library", exact: true }).click();
await page.getByLabel("A tiny learning experiment", { exact: false }).check();
await page
  .getByLabel("What's on your mind?")
  .fill("What is my learning experiment, and what should I keep for tomorrow?");
await page
  .locator("form")
  .getByRole("button", { name: "Ask my library" })
  .click();
await page.locator(".answer-card .evidence").waitFor({ timeout: 115000 });
await page.locator(".answer-card .evidence summary").click();
await page.screenshot({
  path: ".local/screenshots/ask-desktop.png",
  fullPage: true,
});
console.log("PASS: real OpenAI answer with verified source quote");
await page.getByRole("button", { name: "Keep learning", exact: false }).click();
await page.getByRole("button", { name: "New session" }).click();
await page
  .getByLabel("What would you like to understand?")
  .fill("How can I remember more of what I read?");
await page.getByRole("button", { name: "Let's explore" }).click();
await page.locator(".coach-response").waitFor({ timeout: 115000 });
await page.locator(".coach-response .evidence").waitFor();
await page
  .getByLabel("Your turn. Think out loud.")
  .fill(
    "I should close the source and explain the idea in my own words, then compare it to the original.",
  );
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.locator(".coach-response").nth(1).waitFor({ timeout: 115000 });
await page.locator(".coach-response").nth(1).locator(".evidence").waitFor();
await page.getByRole("button", { name: "Pause", exact: true }).click();
await page.getByText("Paused — ready when you are").waitFor();
await page.screenshot({
  path: ".local/screenshots/learn-desktop.png",
  fullPage: true,
});
await page.reload();
await page.getByRole("button", { name: /Keep learning/ }).click();
await page
  .locator(".session-card")
  .filter({ hasText: "How can I remember" })
  .click();
await page.locator(".coach-response").nth(1).waitFor();
console.log(
  "PASS: real agent learning, response, pause and resume after reload",
);
await page
  .locator("nav")
  .getByRole("button", { name: /^My library/ })
  .click();
await context.storageState({ path: ".local/test-session.json" });
await page.getByRole("button", { name: "Save something" }).click();
await page
  .getByLabel("Page URL")
  .fill("https://en.wikipedia.org/wiki/Spaced_repetition");
await page.getByRole("button", { name: "Save to my library" }).click();
const imported = page
  .locator(".source-row")
  .filter({ hasText: "wikipedia.org" });
await imported.waitFor();
await imported
  .filter({ hasText: "Spaced repetition" })
  .waitFor({ timeout: 115000 });
await imported.locator(".source-open").click();
if ((await page.locator("dialog .prose").innerText()).length < 500)
  throw new Error("Imported article is unexpectedly short");
await page.getByRole("button", { name: "Close dialog" }).click();
console.log(
  "PASS: real Firecrawl article import through durable Convex workflow",
);
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: ".local/screenshots/library-mobile.png",
  fullPage: true,
});
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
if (overflow) throw new Error("Mobile page has horizontal overflow");
console.log("PASS: mobile layout without horizontal overflow");
await context.storageState({ path: ".local/test-session.json" });
console.log("Browser errors:", errors.length);
if (errors.length) throw new Error(errors.join("\n"));
await browser.close();
