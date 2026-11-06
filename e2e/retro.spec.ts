import { expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 見た目を選んでいない人が、最初にどう見えるかを確かめる
test.use({ storageState: { cookies: PROMISE_SEEN, origins: [] } });

async function asPerson(page: Page, id: string) {
  await page.context().addCookies([{ name: "koekata_person", value: id, domain: "127.0.0.1", path: "/" }]);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}

async function say(page: Page, words: string) {
  await page.getByLabel("パートナーに書く").fill(words);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
}

test("生徒はレトロから始まり、液晶のパートナー、入力欄、真ん中のマイク、左右の丸ボタンが1画面にある", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "retro");
  await expect(page.getByRole("img", { name: "青木 ひよりさんのパートナー" })).toBeVisible();
  await expect(page.getByLabel("パートナーに書く")).toBeVisible();
  const mic = await page.getByRole("button", { name: "押し続けて話す" }).boundingBox();
  const send = await page.getByRole("button", { name: "とどける" }).boundingBox();
  const photo = await page.locator("label.device-side").boundingBox();
  expect(mic && mic.y + mic.height <= page.viewportSize()!.height).toBe(true);
  expect(mic && mic.height >= 44).toBe(true);
  // マイクが真ん中で、左に写真、右にとどける
  expect(photo!.x + photo!.width <= mic!.x).toBe(true);
  expect(mic!.x + mic!.width <= send!.x).toBe(true);
  await noOverflow(page);
});

test("書いてパートナーと話し、とどけるで下書きを確かめる。Teams の見え方の中で直接直せる", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  const words = `部活のことを話したい ${test.info().testId}`;
  await say(page, words);
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "とどける" }).click();
  const body = page.getByLabel("投稿の文章");
  await expect(body).toHaveValue(words);
  // 文章は Teams の見え方の中に1か所だけ
  await expect(page.locator(".preview").getByLabel("投稿の文章")).toBeVisible();
  await expect(page.locator(".compose-card textarea")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeVisible();
  await noOverflow(page);
});

test("やり取りは液晶の中だけで動き、ホイールを回すと読み返せる", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  for (let i = 0; i < 4; i += 1) {
    await say(page, `長い話 ${i} ${"あ".repeat(120)}`);
    await expect(page.getByRole("log").locator(".bubble.assistant")).toHaveCount(i + 1);
  }
  const log = page.getByRole("log");
  const pageScroll = await page.evaluate(() => document.scrollingElement!.scrollTop);
  expect(pageScroll).toBe(0);
  const before = await log.evaluate((element) => element.scrollTop);
  expect(before).toBeGreaterThan(0);

  const wheel = (await page.locator(".click-wheel").boundingBox())!;
  const cx = wheel.x + wheel.width / 2;
  const cy = wheel.y + wheel.height / 2;
  const r = wheel.width * 0.46;
  // 輪の上を反時計回りに動かす
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (const degrees of [-20, -40, -60, -80, -100]) {
    const radians = (degrees * Math.PI) / 180;
    await page.mouse.move(cx + r * Math.cos(radians), cy + r * Math.sin(radians));
  }
  await page.mouse.up();
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeLessThan(before);
});

test("命や安全の案内はレトロでも液晶の中に見える", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  await say(page, "親に殴られている");
  const card = page.getByRole("region", { name: "相談室に伝えました" });
  await expect(card).toContainText("0120-0-78310");
  await expect(card).toBeInViewport();
  await noOverflow(page);
});

test("話す画面の左右のスワイプで、履歴と設定、みんなへ移る", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/");
  const swipe = (dx: number) =>
    page.evaluate((distance) => {
      const target = document.body;
      const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 300 });
      target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch(200)], changedTouches: [touch(200)] }));
      target.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [touch(200 + distance)] }));
    }, dx);
  // 画面が動き出す前の指の動きは拾えないので、届くまで繰り返す
  await expect(async () => {
    await swipe(-150);
    await expect(page).toHaveURL(/\/minna$/, { timeout: 1000 });
  }).toPass();
  await page.goto("/");
  await expect(async () => {
    await swipe(150);
    await expect(page).toHaveURL(/\/me$/, { timeout: 1000 });
  }).toPass();
  await expect(page.getByRole("heading", { name: "履歴と設定" })).toBeVisible();
  await context.close();
});

test("横画面では左に液晶と入力欄、右にマイクで、はみ出さない", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
  await context.addCookies([{ name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/");
  const lcd = (await page.locator(".lcd").boundingBox())!;
  const input = (await page.locator(".device-input").boundingBox())!;
  const mic = (await page.getByRole("button", { name: "押し続けて話す" }).boundingBox())!;
  expect(lcd.x + lcd.width <= mic.x).toBe(true);
  expect(input.y >= lcd.y + lcd.height - 1).toBe(true);
  await noOverflow(page);
  await context.close();
});

test("ようすは「パートナー」のタイルから開き、姿と数を1画面で見せ、気分の推定は出さない", async ({ page }) => {
  await asPerson(page, "kinoshita");
  await page.goto("/me?open=partner");
  await page.getByRole("link", { name: /ようす/ }).click();
  const list = page.locator(".yousu dl");
  for (const term of ["すがた", "ありがとう", "つないだ", "覚えたこと"]) await expect(list.getByText(term)).toBeVisible();
  await expect(page.locator("main")).not.toContainText("気分");
  await noOverflow(page);
});
