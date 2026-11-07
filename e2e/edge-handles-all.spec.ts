import { type Browser, expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 0-3o：左右のつまみの棒は、狭い画面のどのページにも出る。縦向きでは画面の高さの 12〜15%。3列では出ない

const SIZES = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad 縦", width: 820, height: 1180 },
] as const;

/** 3つの画面と、奥の画面全部。行き先は [左, 右]（3つの画面は輪の隣、奥の画面は左右どちらも話す画面） */
const PAGES: [string, string, string][] = [
  ["/", "履歴と設定へ", "みんなへ"],
  ["/minna", "話す画面へ", "履歴と設定へ"],
  ["/me", "みんなへ", "話す画面へ"],
  ["/today", "話す画面へ", "話す画面へ"],
  ["/inbox", "話す画面へ", "話す画面へ"],
  ["/chie", "話す画面へ", "話す画面へ"],
  ["/chie/new", "話す画面へ", "話す画面へ"],
  ["/chie/knowledge-quick-quiz", "話す画面へ", "話す画面へ"],
  ["/study", "話す画面へ", "話す画面へ"],
  ["/study/room", "話す画面へ", "話す画面へ"],
  ["/daily", "話す画面へ", "話す画面へ"],
  ["/daily/received", "話す画面へ", "話す画面へ"],
  ["/lookback", "話す画面へ", "話す画面へ"],
  ["/portfolio", "話す画面へ", "話す画面へ"],
  ["/walk", "話す画面へ", "話す画面へ"],
  ["/koho", "話す画面へ", "話す画面へ"],
  ["/soudan", "話す画面へ", "話す画面へ"],
  ["/yousu", "話す画面へ", "話す画面へ"],
  ["/sakura", "話す画面へ", "話す画面へ"],
  ["/people/ogawara", "話す画面へ", "話す画面へ"],
  ["/me?open=daily", "話す画面へ", "話す画面へ"],
  ["/me?open=lookback", "話す画面へ", "話す画面へ"],
  ["/me?open=goals", "話す画面へ", "話す画面へ"],
  ["/me?open=thanks", "話す画面へ", "話す画面へ"],
  ["/me?open=partner", "話す画面へ", "話す画面へ"],
  ["/me?open=settings", "話す画面へ", "話す画面へ"],
];

async function context(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport });
  await ctx.addCookies(PROMISE_SEEN);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("koekata_hint_edge", "1");
      localStorage.setItem("koekata_hint_wheel", "1");
    } catch {
      // なくても動く
    }
  });
  return ctx;
}

/** 左右の棒が見える範囲にあり、手前にあって押せ、縦の長さが画面の 12〜15% */
async function expectHandles(page: Page, size: { width: number; height: number }, names?: [string, string]) {
  for (const side of ["left", "right"] as const) {
    const handle = page.locator(`button.edge-handle[data-side="${side}"]`);
    await expect(handle).toBeVisible();
    await expect(handle).toBeInViewport({ ratio: 1 });
    if (names) await expect(handle).toHaveAccessibleName(names[side === "left" ? 0 : 1]);
    const bar = (await handle.locator(".edge-handle-bar").boundingBox())!;
    expect(bar.height / size.height).toBeGreaterThanOrEqual(0.12);
    expect(bar.height / size.height).toBeLessThanOrEqual(0.15);
    // ほかの部品に隠れていない（棒の真ん中で一番手前にあるのが棒）
    const onTop = await handle.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit !== null && element.contains(hit);
    });
    expect(onTop).toBe(true);
  }
}

for (const size of SIZES) {
  test(`${size.name}：全部のページで、左右の棒が見え、長さが画面の 12〜15%`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await context(browser, size);
    const page = await ctx.newPage();
    for (const [path, left, right] of PAGES) {
      await test.step(path, async () => {
        await page.goto(path);
        await expectHandles(page, size, [left, right]);
      });
    }
    await page.goto("/");
    await page.screenshot({ path: test.info().outputPath(`話す-${size.name}.png`) });
    await page.goto("/inbox");
    await page.screenshot({ path: test.info().outputPath(`受信箱-${size.name}.png`) });
    await ctx.close();
  });

  test(`${size.name}：シートやモーダルを開いていても棒は手前にあり、押すと閉じて移る`, async ({ browser }) => {
    const ctx = await context(browser, size);
    // 今日の3人のモーダル（その日はじめてのみんなで開く）
    await ctx.clearCookies({ name: "koekata_today_seen" });
    const page = await ctx.newPage();
    await page.goto("/minna");
    const modal = page.getByRole("dialog", { name: "今日の3人" });
    await expect(modal).toBeVisible();
    await expectHandles(page, size, ["話す画面へ", "履歴と設定へ"]);
    await page.screenshot({ path: test.info().outputPath(`今日の3人-${size.name}.png`) });
    await page.getByRole("button", { name: "履歴と設定へ" }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(modal).toHaveCount(0);

    // 返信のシート
    await page.goto("/minna");
    await page.locator(".minna-post-reply").first().click();
    const sheet = page.locator(".minna-reply-sheet");
    await expect(sheet).toBeVisible();
    await expectHandles(page, size);
    await page.screenshot({ path: test.info().outputPath(`返信のシート-${size.name}.png`) });
    await page.getByRole("button", { name: "話す画面へ" }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await expect(sheet).toHaveCount(0);
    await ctx.close();
  });

  test(`${size.name}：奥の画面の棒は、左右どちらでも話す画面へ。話す画面の帯の上では輪の隣へ`, async ({ browser }) => {
    const ctx = await context(browser, size);
    const page = await ctx.newPage();
    await page.goto("/inbox");
    await page.getByRole("button", { name: "話す画面へ" }).first().click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await page.goto("/walk");
    await page.locator('button.edge-handle[data-side="right"]').click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    // 帯：右の棒でみんな、もう一度右で履歴と設定、もう一度で話す画面（輪）
    await expect(page.locator("html[data-strip-ready]")).toHaveCount(1, { timeout: 30_000 });
    const right = page.locator('button.edge-handle[data-side="right"]');
    const rest = () => page.evaluate(() => window.koekataStrip!.rest());
    await right.click();
    await expect(page).toHaveURL(/\?pane=right$/);
    await expect.poll(rest).toBe(-1);
    await expect(right).toHaveAccessibleName("履歴と設定へ");
    await expectHandles(page, size);
    await page.screenshot({ path: test.info().outputPath(`帯のみんな-${size.name}.png`) });
    await right.click();
    await expect(page).toHaveURL(/\?pane=left$/);
    await expect.poll(rest).toBe(1);
    await right.click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await expect.poll(rest).toBe(0);
    await ctx.close();
  });
}

test("3列（横向きで高さ 600 以上）では、どのページにも出さない", async ({ browser }) => {
  const ctx = await context(browser, { width: 1180, height: 820 });
  const page = await ctx.newPage();
  for (const path of ["/", "/minna", "/me", "/inbox"]) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeAttached();
    for (const handle of await page.locator("button.edge-handle").all()) await expect(handle).toBeHidden();
  }
  // 列（iframe）の中にも出さない
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    for (const handle of await frame.locator("button.edge-handle").all()) await expect(handle).toBeHidden();
  }
  await ctx.close();
});
