import { type Browser, expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 0-2z の最小の形：ドラッグ中は指に1対1で付いて隣の画面がチラ見えし、離すとばねで吸い付く

/** 左右の画面の裏の読み込み（iframe）を止める。写しのチラ見せと、読み込み直す移り方を確かめるとき */
async function withoutPanes(page: Page) {
  await page.route(/\/(me|minna)(\?|$)/, (route) =>
    route.request().frame() !== page.mainFrame() && route.request().resourceType() === "document" ? route.abort() : route.continue(),
  );
}

async function touchContext(browser: Browser) {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  await context.addCookies(PROMISE_SEEN);
  return context;
}

/** 指を置いて dx まで動かす（離さない）。動かした画面の位置と、チラ見せの有無を返す */
function drag(page: Page, dx: number) {
  return page.evaluate((dx) => {
    const target = document.querySelector(".retro-home") ?? document.body;
    const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 420 });
    const send = (type: string, x: number, active: boolean) =>
      target.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: active ? [touch(x)] : [], changedTouches: [touch(x)] }));
    send("touchstart", 200, true);
    for (let step = 1; step <= 8; step++) send("touchmove", 200 + (dx * step) / 8, true);
    const screen = document.querySelector<HTMLElement>(".retro-home");
    const peek = document.querySelector<HTMLElement>(".swipe-peek");
    return {
      screen: screen ? new DOMMatrixReadOnly(getComputedStyle(screen).transform).m41 : null,
      peek: peek ? peek.getBoundingClientRect().left : null,
    };
  }, dx);
}

function release(page: Page, x: number) {
  return page.evaluate((x) => {
    const target = document.querySelector(".retro-home") ?? document.body;
    const touch = new Touch({ identifier: 1, target, clientX: x, clientY: 420 });
    target.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [touch] }));
  }, x);
}

test("ドラッグ中は指に1対1で動き、隣の画面がチラ見えする。少しだけなら、ばねで元へ戻る", async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await withoutPanes(page);
  await page.goto("/");
  let state = { screen: null as number | null, peek: null as number | null };
  await expect(async () => {
    state = await drag(page, -40);
    expect(state.peek).not.toBeNull();
  }).toPass({ timeout: 20_000 });
  // 1対1：指を 40px 動かせば、画面も 40px
  expect(state.screen).toBeCloseTo(-40, 0);
  // 右から隣（みんな）が覗いている
  expect(state.peek!).toBeLessThan(390);
  expect(state.peek!).toBeGreaterThan(300);
  await release(page, 160);
  await expect(page.locator(".swipe-peek")).toHaveCount(0);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector(".retro-home")!).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await context.close();
});

test("大きく払えば隣の画面へ吸い付いて移り、チラ見せの姿は外れる。戻るときは前の姿が見える", async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await withoutPanes(page);
  await page.goto("/");
  await expect(async () => {
    const state = await drag(page, -200);
    expect(state.peek).not.toBeNull();
  }).toPass({ timeout: 20_000 });
  await release(page, 0);
  await expect(page).toHaveURL(/\/minna$/);
  await expect(page.getByRole("region", { name: "みんな" })).toBeVisible();
  await expect(page.locator(".swipe-peek")).toHaveCount(0);
  // みんなから右へ払うと、さっきの話す画面の姿がチラ見えする
  await expect(async () => {
    const state = await drag(page, 60);
    expect(state.peek).not.toBeNull();
  }).toPass({ timeout: 20_000 });
  await expect(page.locator(".swipe-peek .talk")).toHaveCount(1);
  await release(page, 400);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.locator(".swipe-peek")).toHaveCount(0);
  await context.close();
});

test("話す画面では、3つの画面が1本の帯になる。指に1対1で付き、離すとばねで吸い付き、URL だけが替わる。左右の画面の中から払えば戻る", async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await page.goto("/");
  // 左右の画面は裏で読み込まれ、画面の外にある
  const right = page.locator('.wide-panel[data-side="right"][data-mode="pane"]');
  await expect(right.locator("iframe")).toHaveAttribute("src", "/minna");
  const minna = page.frameLocator('.wide-panel[data-side="right"] iframe');
  await expect(minna.getByRole("region", { name: "みんな" })).toBeAttached();
  await expect(page.frameLocator('.wide-panel[data-side="left"] iframe').locator(".me-tiles")).toBeAttached();
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLIFrameElement>(".wide-panel iframe")].every((frame) => frame.contentDocument?.readyState === "complete"),
  );
  expect(await right.evaluate((element) => element.getBoundingClientRect().left)).toBeGreaterThanOrEqual(389);
  // 指に1対1で付いて、本物のみんなの画面が覗く
  let state = { screen: null as number | null, peek: null as number | null };
  await expect(async () => {
    state = await drag(page, -60);
    expect(state.screen).toBeCloseTo(-60, 0);
  }).toPass({ timeout: 20_000 });
  expect(await right.evaluate((element) => element.getBoundingClientRect().left)).toBeCloseTo(390 - 60, 0);
  // 少しだけなら戻る
  await release(page, 170);
  await expect.poll(() => right.evaluate((element) => element.getBoundingClientRect().left)).toBeGreaterThanOrEqual(389);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  // 大きく払えば、みんなが真ん中に来て、URL だけが /minna になる（読み込み直さない）
  await drag(page, -200);
  await release(page, 0);
  await expect(page).toHaveURL(/\/minna$/);
  await expect(page.locator('.device-row[data-pane="right"]')).toHaveCount(1);
  await expect.poll(() => right.evaluate((element) => Math.round(element.getBoundingClientRect().left))).toBe(0);
  await expect(minna.getByRole("region", { name: "みんな" })).toBeInViewport();
  // みんなの画面の中から右へ払うと、話す画面へ戻る
  await expect(async () => {
    await right.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
      const doc = frame.contentDocument!;
      const win = frame.contentWindow! as Window & typeof globalThis;
      const target = doc.querySelector(".minna-post") ?? doc.body;
      const touch = (x: number) => new win.Touch({ identifier: 1, target, clientX: x, clientY: 500 });
      const send = (type: string, x: number, active: boolean) =>
        target.dispatchEvent(new win.TouchEvent(type, { bubbles: true, touches: active ? [touch(x)] : [], changedTouches: [touch(x)] }));
      send("touchstart", 100, true);
      for (let step = 1; step <= 8; step++) send("touchmove", 100 + step * 25, true);
      send("touchend", 300, false);
    });
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/, { timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator(".device-row[data-pane]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "押し続けて話す" })).toBeInViewport();
  await context.close();
});
