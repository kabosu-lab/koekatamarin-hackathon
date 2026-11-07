import { type Browser, expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 0-2z の最小の形：ドラッグ中は指に1対1で付いて隣の画面がチラ見えし、離すとばねで吸い付く

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

test("話す画面では、左右の画面を裏で読み込んでおき、ドラッグ中は本物の画面が覗く。離せば移る", async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await page.goto("/");
  // 裏で読み込んだ左右の画面は、画面の外にある
  const right = page.locator('.wide-panel[data-side="right"][data-mode="pane"] iframe');
  await expect(right).toHaveAttribute("src", "/minna");
  await expect(page.frameLocator('.wide-panel[data-side="right"] iframe').getByRole("region", { name: "みんな" })).toBeAttached();
  const outside = await page.evaluate(() => document.querySelector('.wide-panel[data-side="right"]')!.getBoundingClientRect().left);
  expect(outside).toBeGreaterThanOrEqual(389);
  // ドラッグ中は、その本物の画面が指に付いて覗く（写しは作らない）
  let state = { screen: null as number | null, peek: null as number | null };
  await expect(async () => {
    state = await drag(page, -60);
    expect(state.peek).not.toBeNull();
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('.wide-panel[data-side="right"].swipe-peek')).toHaveCount(1);
  expect(state.peek!).toBeCloseTo(390 - 60, -1);
  await release(page, 170);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.locator(".swipe-peek")).toHaveCount(0);
  // 大きく払えば、みんなへ移る
  await expect(async () => {
    const moved = await drag(page, -200);
    expect(moved.peek).not.toBeNull();
  }).toPass({ timeout: 20_000 });
  await release(page, 0);
  await expect(page).toHaveURL(/\/minna$/);
  await expect(page.getByRole("region", { name: "みんな" })).toBeVisible();
  await context.close();
});
