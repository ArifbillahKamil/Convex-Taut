import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  storageState: ".local/test-session.json",
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
await page.goto("http://127.0.0.1:5173");
await page.locator(".learning-banner h2").waitFor();
await page.locator(".source-row").first().waitFor();
await page.getByRole("button", { name: "Continue learning" }).waitFor();
await page.evaluate(() => document.fonts.ready);
const copy = await page.locator(".banner-copy").boundingBox();
if (!copy || copy.width < 180)
  throw new Error("Learning banner text column is too narrow");
await page.screenshot({
  path: ".local/screenshots/library-mobile.png",
  fullPage: true,
});
await page.setViewportSize({ width: 1440, height: 1050 });
await page.screenshot({
  path: ".local/screenshots/library-desktop.png",
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Continue learning" }).click();
await page.locator(".coach-response").nth(1).waitFor();
await page.screenshot({
  path: ".local/screenshots/learn-mobile.png",
  fullPage: true,
});
if (
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
)
  throw new Error("Learning page overflows");
console.log(
  "PASS: mobile banner has a readable column; library and learning layouts captured.",
);
await browser.close();
