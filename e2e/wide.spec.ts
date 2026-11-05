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

test("みんなと、履歴と設定も同じ本体で、ホイールで一覧が動く", async ({ page }) => {
  for (const [path, label] of [["/minna", "みんな"], ["/me", "履歴と設定"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("region", { name: label })).toBeVisible();
    await expect(page.locator(".click-wheel")).toBeVisible();
    await expect(page.locator(".device-mic")).toHaveText(/話す/);
  }
  const win = page.getByRole("region", { name: "履歴と設定" });
  const wheel = (await page.locator(".click-wheel").boundingBox())!;
  const cx = wheel.x + wheel.width / 2;
  const cy = wheel.y + wheel.height / 2;
  const r = wheel.width * 0.46;
  // トロフィーが届いた瞬間の全画面の知らせが重なることがあるので、閉じてから回す
  await expect(async () => {
    const moment = page.locator(".ribbon-moment");
    if (await moment.isVisible()) await moment.click();
    await page.mouse.move(cx + r, cy);
    await page.mouse.down();
    for (const degrees of [20, 40, 60, 80, 100]) {
      const radians = (degrees * Math.PI) / 180;
      await page.mouse.move(cx + r * Math.cos(radians), cy + r * Math.sin(radians));
    }
    await page.mouse.up();
    expect(await win.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });
});

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
