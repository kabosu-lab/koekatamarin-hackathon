import { expect, test } from "@playwright/test";

const PAGES = ["/", "/minna", "/me", "/today", "/chie", "/inbox", "/teams", "/study", "/study/room", "/daily", "/lookback"];

async function noOverflow(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, path).toBe(0);
}

test("スマホでは、広い画面の欄を出さず、タブは下にある", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "校内チャネルのようす" })).toHaveCount(0);
  const nav = await page.getByRole("navigation", { name: "画面の切り替え" }).boundingBox();
  expect(nav?.width).toBeGreaterThan(300);
});
