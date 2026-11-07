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
  // 大きく払えば、みんなが真ん中に来て、URL は /?pane=right になる（読み込み直さない）
  await drag(page, -200);
  await release(page, 0);
  await expect(page).toHaveURL(/\/\?pane=right$/);
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

/** 話す画面を開き、左右の画面が裏で読み込み終わるまで待つ */
async function openStrip(page: Page) {
  await page.goto("/");
  await stripLoaded(page);
}

/** 左右の画面（奥へ進んでいたら入口へ戻ったもの）が読み込み終わるまで待つ */
async function stripLoaded(page: Page) {
  await page.waitForFunction(() => {
    const frames = [...document.querySelectorAll<HTMLIFrameElement>('.wide-panel[data-mode="pane"] iframe')];
    // 読み込みの前の iframe は about:blank のまま complete になるので、中の画面の場所も確かめる
    return (
      frames.length === 2 &&
      frames.every((frame) => frame.contentDocument?.readyState === "complete") &&
      frames.every((frame) => /^\/(me|minna)/.test(frame.contentWindow?.location.pathname ?? "")) &&
      Boolean(window.koekataStrip) &&
      // 外側が帯を動かせると決めた印（窓ごと読み直している途中は付かない）
      document.documentElement.dataset.stripReady === "true"
    );
  });
}

const goStrip = (page: Page, href: string) => page.evaluate((target) => window.koekataStrip!.go(target), href);

test("帯：「戻る」で話す画面へ戻り、再読み込みしても同じ画面のまま", async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await openStrip(page);
  expect(await goStrip(page, "/minna")).toBe(true);
  await expect(page).toHaveURL(/\/\?pane=right$/);
  await expect(page.locator('.device-row[data-pane="right"]')).toHaveCount(1);
  await expect(page.locator("main.retro-home")).toHaveAttribute("inert", "");
  // ブラウザの「戻る」で、アプリの外ではなく話す画面へ
  await page.goBack();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.locator(".device-row[data-pane]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "押し続けて話す" })).toBeInViewport();
  // 再読み込みしても、帯で開いた画面のまま（話す画面の木はそのまま）
  await goStrip(page, "/minna");
  await expect(page).toHaveURL(/\/\?pane=right$/);
  await page.reload();
  await expect(page.locator('.device-row[data-pane="right"]')).toHaveCount(1);
  const right = page.locator('.wide-panel[data-side="right"]');
  await expect.poll(() => right.evaluate((element) => Math.round(element.getBoundingClientRect().left))).toBe(0);
  await expect(page.frameLocator('.wide-panel[data-side="right"] iframe').getByRole("region", { name: "みんな" })).toBeInViewport();
  await expect(right).not.toHaveAttribute("inert", "");
  await context.close();
});

test("帯：左の画面で人を切り替えると、話す画面と右の画面も新しい人になる", async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await openStrip(page);
  await goStrip(page, "/me");
  await expect(page).toHaveURL(/\/\?pane=left$/);
  const left = page.frameLocator('.wide-panel[data-side="left"] iframe');
  await left.locator('a[data-tile="settings"]').click();
  await left.getByLabel("試す人を切り替える").selectOption({ label: "青木 ひより（2年）" });
  const switched = page.waitForResponse((response) => Boolean(response.request().headers()["next-action"]));
  await left.getByRole("button", { name: "切り替え" }).click();
  await switched;
  // 話す画面へ戻ると、窓ごと読み直して話す画面も新しい人になる（読み直しが済むまで帯は止まる）
  const reloaded = page.waitForEvent("load");
  expect(await goStrip(page, "/")).toBe(true);
  await reloaded;
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.locator('.talk[data-viewer="青木 ひより"]')).toBeVisible();
  // 右のみんなも、生徒の画面（職員室の札がない）。左の画面が入口へ戻って読み込み終わってから
  await stripLoaded(page);
  // 読み直しの直後は、届きかけの読み込みが落ち着くまで待つ（重いときに帯が元の位置へ描き直されることがある）
  await page.waitForLoadState("networkidle");
  const right = page.frameLocator('.wide-panel[data-side="right"] iframe');
  // 帯が動いたあとはもう一度頼まない（着いている画面への go は false を返す）
  expect(await goStrip(page, "/minna")).toBe(true);
  await expect(page.locator('.device-row[data-pane="right"]')).toHaveCount(1);
  // みんなの画面が見えている。チャネルの札は、最近の投稿が2つ以上のチャネルにあるときだけ出るので
  // （ほかのテストの投稿で1つのチャネルだけになることがある）、札の有無ではなく、職員室が出ていないことで生徒の画面と確かめる
  await expect(right.getByRole("region", { name: "みんな" })).toBeInViewport();
  await expect(right.getByRole("group", { name: "チャネルで絞る" }).getByRole("button", { name: "職員室" })).toHaveCount(0);
  await expect(right.locator(".minna-post-head small", { hasText: "職員室" })).toHaveCount(0);
  // 左の履歴と設定も新しい人
  await expect(page.frameLocator('.wide-panel[data-side="left"] iframe').getByRole("img", { name: "青木 ひよりさんのパートナー" }).first()).toBeAttached();
  await context.close();
});

test("帯：その日はじめて帯でみんなを開くと、今日の3人が開き、見た印が付く", async ({ browser }) => {
  const context = await touchContext(browser);
  await context.clearCookies({ name: "koekata_today_seen" });
  const page = await context.newPage();
  await openStrip(page);
  // 裏で読み込んだだけでは開かず、見た印も付かない
  const right = page.frameLocator('.wide-panel[data-side="right"] iframe');
  await expect(right.getByRole("dialog", { name: "今日の3人" })).toHaveCount(0);
  expect((await context.cookies()).some((cookie) => cookie.name === "koekata_today_seen")).toBe(false);
  await goStrip(page, "/minna");
  await expect(right.getByRole("dialog", { name: "今日の3人" })).toBeVisible();
  await expect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === "koekata_today_seen")).toBe(true);
  await context.close();
});

test("帯：URL のほかの引数（?talk=send）は残る", async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await page.goto("/?talk=send");
  await stripLoaded(page);
  expect(await goStrip(page, "/minna")).toBe(true);
  await expect(page).toHaveURL(/\/\?talk=send&pane=right$/);
  expect(await goStrip(page, "/")).toBe(true);
  await expect(page).toHaveURL(/\/\?talk=send$/);
  await context.close();
});

test("帯：何度往復しても、記録は1つだけ。「戻る」2回でアプリの外へ出る", async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await openStrip(page);
  for (const href of ["/minna", "/", "/me", "/", "/minna"]) {
    expect(await goStrip(page, href)).toBe(true);
    await expect(page).toHaveURL(href === "/" ? /127\.0\.0\.1:\d+\/$/ : /\?pane=(left|right)$/);
    // 着いたあとで次へ（ばねが止まって、左右の画面の読み直しが済むまで）
    await expect.poll(() => page.evaluate(() => window.koekataStrip!.rest())).toBe(href === "/minna" ? -1 : href === "/me" ? 1 : 0);
    await stripLoaded(page);
  }
  await page.goBack();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.locator(".device-row[data-pane]")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL("about:blank");
  await context.close();
});
