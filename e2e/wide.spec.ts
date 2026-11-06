import { expect, test } from "@playwright/test";
import { openScreen } from "./helpers";

// 今日の3人のモーダル（その日はじめての「みんな」で出る）は、出したことにしておく。モーダルは e2e/minna.spec.ts で確かめる
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
});

const PAGES = ["/", "/minna", "/me", "/today", "/chie", "/inbox", "/teams", "/study", "/study/room", "/daily", "/lookback"];

async function noOverflow(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, path).toBe(0);
}

test("スマホでは、広い画面の欄を出さず、下のタブのかわりにページの点で移る", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "校内チャネルのようす" })).toHaveCount(0);
  // 0-1q：下の3つのタブは出さない。入口は左右のスワイプとページの点
  await expect(page.locator(".bottom-nav")).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "画面の切り替え" });
  await expect(nav).toHaveCount(1);
  await expect(nav.getByRole("link", { name: /みんな/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /履歴と設定/ })).toBeVisible();
});

test("広い画面では、話す画面の左右に履歴と設定、みんなを並べ、欄の中のリンクは欄の中で動く", async ({ page, context }) => {
  // 欄の中でモーダルが自動で出ないことも確かめるので、出した印は消しておく
  await context.clearCookies({ name: "koekata_today_seen" });
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
  // 欄の中では今日の3人のモーダルは自動で出ないが、下の帯から開ける
  const today = minna.getByRole("dialog", { name: "今日の3人" });
  await expect(today).toHaveCount(0);
  await minna.getByRole("navigation", { name: "みんなの入口" }).getByRole("button", { name: "今日の3人" }).click();
  await expect(today).toBeVisible();
  await today.getByRole("button", { name: "みんなを見る" }).click();
  await expect(today).toHaveCount(0);
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
  // 0-1x：今日の3人はモーダルで開く
  await expect(page.getByRole("navigation", { name: "みんなの入口" }).getByRole("button", { name: "今日の3人" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "みんなの入口" }).getByRole("link", { name: /受信箱/ })).toBeVisible();
});

// 0-1e・0-2b：履歴と設定の項目は、どの幅でもスクロールなしで全部見えて、押すと開き、戻れる
for (const viewport of [
  { width: 390, height: 664 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  test(`履歴と設定のタイルは、スクロールなしで全部見える（${viewport.width}×${viewport.height}）`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // 0-2y：広い画面では、履歴と設定は3列の左の列の中
    const screen = await openScreen(page, "/me");
    // トロフィーの小さな知らせは押すとコレクションへ移るので、押さずに Esc で閉じる
    const toast = page.locator(".trophy-toast");
    if (await toast.isVisible().catch(() => false)) await page.keyboard.press("Escape");
    const tiles = screen.getByRole("navigation", { name: "履歴と設定の項目" }).getByRole("link");
    // 0-2b：6枚（3列×2段）と、その下の「これまで」の帯
    await expect(tiles).toHaveCount(6);
    for (const tile of await tiles.all()) await expect(tile).toBeInViewport({ ratio: 1 });
    await expect(screen.getByRole("region", { name: "これまで" })).toBeInViewport({ ratio: 1 });
    await tiles.filter({ hasText: "頑張りたいこと" }).click();
    await expect(screen.getByRole("region", { name: "頑張りたいこと" })).toBeVisible();
    await screen.getByRole("link", { name: "‹ 履歴と設定" }).click();
    await expect(tiles.first()).toBeVisible();
  });
}

test("みんなの一番上に校内の桜があり、すぐ下の入口の列に受信箱と自習室がある", async ({ page }) => {
  await page.goto("/minna");
  const sakura = await page.getByRole("link", { name: "校内の桜" }).boundingBox();
  const entrances = page.getByRole("navigation", { name: "みんなの入口" });
  const row = await entrances.boundingBox();
  expect(sakura!.y).toBeLessThan(row!.y);
  await expect(page.getByRole("link", { name: "校内の桜" })).toContainText("今週");
  await expect(entrances.getByRole("link", { name: /受信箱/ })).toBeVisible();
  await expect(entrances.getByRole("link", { name: /自習室/ })).toBeVisible();
  await page.getByRole("link", { name: "校内の桜" }).click();
  await expect(page.getByRole("heading", { name: "校内の桜" })).toBeVisible();
});
