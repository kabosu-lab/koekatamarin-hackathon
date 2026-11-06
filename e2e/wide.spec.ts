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

test("広い画面では、話す画面の左右に履歴と設定、みんなを並べ、欄の中のリンクは欄の中で動く", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const minna = page.frameLocator('iframe[title="みんな"]');
  const me = page.frameLocator('iframe[title="履歴と設定"]');
  await expect(minna.getByRole("heading", { name: "みんな" })).toBeVisible();
  await expect(me.getByRole("heading", { name: "履歴と設定" })).toBeVisible();
  const mic = await page.getByRole("button", { name: "押し続けて話す" }).boundingBox();
  expect(mic?.x).toBeGreaterThan(400);
  await expect(page.locator(".retro-home")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await minna.getByRole("link", { name: /受信箱/ }).first().click();
  await expect(minna.getByRole("heading", { name: "受信箱" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("iPad の横向きでも話す画面が狭くなりすぎない", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/");
  const device = await page.locator("main.retro-home").boundingBox();
  expect(device?.width).toBeGreaterThanOrEqual(480);
  await expect(page.frameLocator('iframe[title="みんな"]').getByRole("heading", { name: "みんな" })).toBeVisible();
});

test("iPad の縦向きでは1枚ずつで、欄を並べない", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "みんな ›" })).toBeVisible();
});

test("みんなと、履歴と設定は同じ本体で、ホイールを置かず下まで中身に使う", async ({ page }) => {
  for (const [path, label] of [["/minna", "みんな"], ["/me", "履歴と設定"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("region", { name: label })).toBeVisible();
    // 0-1f：話すボタンとホイールは「話す」画面だけ
    await expect(page.locator(".click-wheel")).toHaveCount(0);
    await expect(page.locator(".device-mic")).toHaveCount(0);
    // 左右の点で「話す」に戻れる
    await expect(page.getByRole("navigation", { name: "画面の切り替え" }).getByRole("link", { name: /話す/ })).toBeVisible();
  }
  await page.goto("/minna");
  await expect(page.getByRole("navigation", { name: "みんなの入口" }).getByRole("link", { name: "今日の3人" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "みんなの入口" }).getByRole("link", { name: /受信箱/ })).toBeVisible();
});

// 0-1e：履歴と設定の項目は、どの幅でもスクロールなしで全部見えて、押すと開き、戻れる
for (const viewport of [
  { width: 390, height: 664 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  test(`履歴と設定のタイルは、スクロールなしで全部見える（${viewport.width}×${viewport.height}）`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/me");
    const moment = page.locator(".ribbon-moment");
    if (await moment.isVisible().catch(() => false)) await moment.click();
    const tiles = page.getByRole("navigation", { name: "履歴と設定の項目" }).getByRole("link");
    expect(await tiles.count()).toBeGreaterThanOrEqual(8);
    for (const tile of await tiles.all()) await expect(tile).toBeInViewport({ ratio: 1 });
    await tiles.filter({ hasText: "頑張りたいこと" }).click();
    await expect(page.getByRole("region", { name: "頑張りたいこと" })).toBeVisible();
    await page.getByRole("link", { name: "‹ 履歴と設定" }).click();
    await expect(tiles.first()).toBeVisible();
  });
}

test("みんなの一番上に校内の桜があり、すぐ下に受信箱、自習室の入口もある", async ({ page }) => {
  await page.goto("/minna");
  const sakura = await page.getByRole("link", { name: "校内の桜" }).boundingBox();
  const inbox = await page.getByRole("navigation", { name: "届いているもの" }).boundingBox();
  expect(sakura!.y).toBeLessThan(inbox!.y);
  await expect(page.getByRole("link", { name: "校内の桜" })).toContainText("今週");
  await expect(page.getByRole("link", { name: "自習室" })).toBeVisible();
  await page.getByRole("link", { name: "校内の桜" }).click();
  await expect(page.getByRole("heading", { name: "校内の桜" })).toBeVisible();
});
