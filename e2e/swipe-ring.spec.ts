import { type Browser, expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 0-3j：3つの画面（履歴と設定・話す・みんな）は輪。同じ向きに3回払うとホームへ戻り、端の先は反対の端が隣から入る

const SIZES = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad 縦", width: 820, height: 1180 },
] as const;

const HOME = /127\.0\.0\.1:\d+\/$/;

async function touchContext(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport });
  await context.addCookies(PROMISE_SEEN);
  // 初めての手ほどき（0-3i）は別のテストで確かめる
  await context.addInitScript(() => {
    try {
      localStorage.setItem("koekata_hint_edge", "1");
      localStorage.setItem("koekata_hint_wheel", "1");
    } catch {
      // なくても動く
    }
  });
  return context;
}

async function openStrip(page: Page) {
  await page.goto("/");
  await expect(page.locator("html[data-strip-ready]")).toHaveCount(1, { timeout: 30_000 });
}

/** 今見えている画面（話す画面か、左右の画面の中）で、指を置いて dx まで動かす。release なら離す */
async function swipeHere(page: Page, dx: number, release = true) {
  const rest = await page.evaluate(() => window.koekataStrip?.rest() ?? 0);
  const side = rest === -1 ? "right" : rest === 1 ? "left" : null;
  const width = page.viewportSize()!.width;
  const run = (args: { dx: number; release: boolean; width: number }) => {
    const target = document.querySelector("main h1, main") ?? document.body;
    const win = window as Window & typeof globalThis;
    const x0 = args.dx < 0 ? args.width * 0.75 : args.width * 0.25;
    const touch = (x: number) => new win.Touch({ identifier: 1, target, clientX: x, clientY: 400 });
    const send = (type: string, x: number, active: boolean) =>
      target.dispatchEvent(new win.TouchEvent(type, { bubbles: true, touches: active ? [touch(x)] : [], changedTouches: [touch(x)] }));
    send("touchstart", x0, true);
    for (let step = 1; step <= 8; step++) send("touchmove", x0 + (args.dx * step) / 8, true);
    if (args.release) send("touchend", x0 + args.dx, false);
  };
  if (side) await page.locator(`.wide-panel[data-side="${side}"] iframe`).evaluate((frame: HTMLIFrameElement, args) => {
    const inner = frame.contentWindow as Window & typeof globalThis & { __run?: (a: unknown) => void };
    inner.eval(`window.__run = ${args.source}`);
    inner.__run!(args.args);
  }, { source: run.toString(), args: { dx, release, width } });
  else await page.evaluate(run, { dx, release, width });
}

/** 払って、帯がその位置で止まるまで待つ */
async function swipeTo(page: Page, dx: number, url: RegExp, rest: -1 | 0 | 1) {
  await swipeHere(page, dx);
  await expect(page).toHaveURL(url);
  await expect.poll(() => page.evaluate(() => window.koekataStrip!.rest())).toBe(rest);
  // ばねが止まって、本体に書いた位置が外れるまで
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLElement>(".retro-home")!.style.transform)).toBe("");
}

for (const size of SIZES) {
  test(`${size.name}：同じ向きに3回払うとホームへ戻る（左へ：話す → みんな → 履歴と設定 → 話す）`, async ({ browser }) => {
    const context = await touchContext(browser, size);
    const page = await context.newPage();
    await openStrip(page);
    const dx = -Math.round(size.width * 0.6);
    await swipeTo(page, dx, /\?pane=right$/, -1);
    await swipeTo(page, dx, /\?pane=left$/, 1);
    await expect(page.frameLocator('.wide-panel[data-side="left"] iframe').locator(".me-tiles")).toBeInViewport();
    await swipeTo(page, dx, HOME, 0);
    await expect(page.getByRole("button", { name: "押し続けて話す" })).toBeInViewport();
    await context.close();
  });

  test(`${size.name}：逆向きも3回でホームへ（右へ：話す → 履歴と設定 → みんな → 話す）`, async ({ browser }) => {
    const context = await touchContext(browser, size);
    const page = await context.newPage();
    await openStrip(page);
    const dx = Math.round(size.width * 0.6);
    await swipeTo(page, dx, /\?pane=left$/, 1);
    await swipeTo(page, dx, /\?pane=right$/, -1);
    await expect(page.frameLocator('.wide-panel[data-side="right"] iframe').getByRole("region", { name: "みんな" })).toBeInViewport();
    await swipeTo(page, dx, HOME, 0);
    await expect(page.getByRole("button", { name: "押し続けて話す" })).toBeInViewport();
    await context.close();
  });

  test(`${size.name}：端で払うと、反対の端の画面が隣から入ってくる。下の帯の名前も輪の隣`, async ({ browser }) => {
    const context = await touchContext(browser, size);
    const page = await context.newPage();
    await openStrip(page);
    const width = size.width;
    await swipeTo(page, -Math.round(width * 0.6), /\?pane=right$/, -1);
    // みんなの下の帯：左は話す、右は履歴と設定（輪の隣）
    const minna = page.frameLocator('.wide-panel[data-side="right"] iframe').getByRole("navigation", { name: "画面の切り替え" });
    await expect(minna.getByRole("link")).toHaveText(["‹ 話す", "履歴と設定 ›"]);
    // みんなからさらに左へ動かす途中：履歴と設定が右から入ってくる
    await swipeHere(page, -100, false);
    const left = page.locator('.wide-panel[data-side="left"]');
    await expect.poll(async () => Math.round((await left.boundingBox())!.x)).toBe(width - 100);
    await page.screenshot({ path: test.info().outputPath(`端の先-${size.name}.png`) });
    // 離せば履歴と設定へ（少しなので戻る）。もう一度大きく払うと履歴と設定に着き、URL が合う
    await page.locator('.wide-panel[data-side="right"] iframe').evaluate((frame: HTMLIFrameElement) => {
      const inner = frame.contentWindow as Window & typeof globalThis;
      const target = inner.document.querySelector("main") ?? inner.document.body;
      const touch = new inner.Touch({ identifier: 1, target, clientX: 100, clientY: 400 });
      target.dispatchEvent(new inner.TouchEvent("touchcancel", { bubbles: true, touches: [], changedTouches: [touch] }));
    });
    await expect.poll(() => page.evaluate(() => document.querySelector<HTMLElement>(".retro-home")!.style.transform)).toBe("");
    await expect(page).toHaveURL(/\?pane=right$/);
    await swipeTo(page, -Math.round(width * 0.6), /\?pane=left$/, 1);
    await expect.poll(async () => Math.round((await left.boundingBox())!.x)).toBe(0);
    // 履歴と設定の下の帯：左はみんな、右は話す
    const me = page.frameLocator('.wide-panel[data-side="left"] iframe').getByRole("navigation", { name: "画面の切り替え" });
    await expect(me.getByRole("link")).toHaveText(["‹ みんな", "話す ›"]);
    // 履歴と設定の「‹ みんな」を押すと、輪の上で近い向きへ帯が動いて、みんなへ
    await me.getByRole("link", { name: "‹ みんな" }).click();
    await expect(page).toHaveURL(/\?pane=right$/);
    await expect.poll(() => page.evaluate(() => window.koekataStrip!.rest())).toBe(-1);
    await context.close();
  });

  test(`${size.name}：単独で開いたみんな・履歴と設定も輪。奥の画面からはホームへ`, async ({ browser }) => {
    const context = await touchContext(browser, size);
    const page = await context.newPage();
    const swipe = (dx: number) =>
      page.evaluate((dx) => {
        const target = document.querySelector("main h1") ?? document.querySelector("main") ?? document.body;
        const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 400 });
        const send = (type: string, x: number, active: boolean) =>
          target.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: active ? [touch(x)] : [], changedTouches: [touch(x)] }));
        const x0 = dx < 0 ? 300 : 80;
        send("touchstart", x0, true);
        for (let step = 1; step <= 6; step++) send("touchmove", x0 + (dx * step) / 6, true);
        send("touchend", x0 + dx, false);
      }, dx);
    await page.goto("/minna");
    await expect(page.getByRole("region", { name: "みんな" })).toBeVisible();
    await expect(async () => {
      await swipe(-200);
      await expect(page).toHaveURL(/\/me$/, { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await page.goto("/inbox");
    await expect(async () => {
      await swipe(-200);
      await expect(page).toHaveURL(HOME, { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await context.close();
  });
}
