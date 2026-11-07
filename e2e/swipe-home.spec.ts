import { type Browser, expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 0-2p：奥の画面では、左右どちらへ払ってもホーム（話す）へ戻る。3枚の行き来は retro.spec.ts で確かめる

async function touchContext(browser: Browser, person?: string, options: { reducedMotion?: "reduce" } = {}) {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, ...options });
  await context.addCookies(PROMISE_SEEN);
  if (person) await context.addCookies([{ name: "koekata_person", value: person, domain: "127.0.0.1", path: "/" }]);
  return context;
}

/**
 * 指で払う。touchstart・touchmove・touchend を順に送る。
 * selector の要素の真ん中から始める（無ければ見出し、本文の順）。離した直後の出ていく画面の位置を返す。
 */
function swipe(page: Page, dx: number, dy = 0, selector?: string) {
  return page.evaluate(
    ({ dx, dy, selector }) => {
      const target =
        (selector ? document.querySelector(selector) : null) ?? document.querySelector("main h1") ?? document.querySelector("main") ?? document.body;
      const box = target.getBoundingClientRect();
      const x = Math.min(Math.max(box.left + box.width / 2, 120), 270);
      const y = Math.min(Math.max(box.top + box.height / 2, 80), 700);
      const touch = (step: number) =>
        new Touch({ identifier: 1, target, clientX: x + (dx * step) / 6, clientY: y + (dy * step) / 6 });
      const send = (type: string, step: number, active: boolean) =>
        target.dispatchEvent(
          new TouchEvent(type, { bubbles: true, cancelable: true, touches: active ? [touch(step)] : [], changedTouches: [touch(step)] }),
        );
      send("touchstart", 0, true);
      for (let step = 1; step <= 6; step++) send("touchmove", step, true);
      send("touchend", 6, false);
      const main = document.querySelector<HTMLElement>("body > main, main");
      return main?.style.transform ?? "";
    },
    { dx, dy, selector },
  );
}

/** 払ってホームへ戻るまで。画面の準備の前の指は拾えないので、届くまで繰り返す */
async function swipeHome(page: Page, dx: number) {
  let leaving = "";
  await expect(async () => {
    leaving = await swipe(page, dx);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/, { timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  // ホームの話す画面が現れる
  await expect(page.locator(".talk.device")).toBeVisible();
  return leaving;
}

const DEEP_SCREENS = [
  "/inbox",
  "/chie",
  "/chie/new",
  "/chie/knowledge-quick-quiz",
  "/daily",
  "/lookback",
  "/koho",
  "/soudan",
  "/study/room",
  "/today",
  "/walk",
  "/yousu",
  "/people/ogawara",
  "/sakura",
  "/me?open=daily",
  "/me?open=lookback",
  "/me?open=goals",
  "/me?open=thanks",
  "/me?open=partner",
  "/me?open=settings",
];

test.describe("奥の画面から、左右どちらへ払ってもホームへ戻る", () => {
  for (const [index, path] of DEEP_SCREENS.entries()) {
    test(path, async ({ browser }) => {
      const context = await touchContext(browser);
      const page = await context.newPage();
      // 左右の向きを、画面ごとに替えて両方を確かめる。初めのいくつかは両方とも
      const directions = index < 3 ? [-160, 160] : [index % 2 === 0 ? -160 : 160];
      for (const dx of directions) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "retro");
        // 別の画面へ送られていない（奥の画面のまま）
        expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path);
        const leaving = await swipeHome(page, dx);
        // 戻るときは、払った向きへ画面が横に流れる
        if (leaving) expect(leaving).toMatch(dx < 0 ? /translateX\(-/ : /translateX\(\d/);
      }
      await context.close();
    });
  }

  test("生徒の奥の画面からも戻る", async ({ browser }) => {
    const context = await touchContext(browser, "aoki");
    const page = await context.newPage();
    for (const path of ["/inbox", "/study/room", "/me?open=daily"]) {
      await page.goto(path);
      await swipeHome(page, path === "/inbox" ? 160 : -160);
    }
    await context.close();
  });

  test("動きを減らす設定でも、払えば戻る（画面は流れない）", async ({ browser }) => {
    const context = await touchContext(browser, undefined, { reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/inbox");
    const leaving = await swipeHome(page, -160);
    expect(leaving).toBe("");
    await context.close();
  });
});

test.describe("奥の画面でも、戻らないとき", () => {
  test("縦のスクロール、短い動き、文字を打つ欄の上では戻らない", async ({ browser }) => {
    const context = await touchContext(browser);
    const page = await context.newPage();
    await page.goto("/chie/new");
    await expect(page.locator("main h1")).toBeVisible();
    await page.waitForTimeout(800);
    // 文字を打つ欄は、画面によって出る時が違うので、その場で置いて確かめる
    await page.evaluate(() => {
      const field = document.createElement("textarea");
      field.id = "words";
      field.style.cssText = "width:240px;height:80px";
      document.querySelector("main")!.prepend(field);
    });
    await swipe(page, 20, 300);
    await swipe(page, -30, 0);
    await swipe(page, -200, 0, "#words");
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/chie\/new$/);
    await context.close();
  });

  test("横にスクロールする列や data-noswipe の上では戻らない", async ({ browser }) => {
    const context = await touchContext(browser);
    const page = await context.newPage();
    await page.goto("/inbox");
    await expect(page.locator("main h1")).toBeVisible();
    await page.waitForTimeout(800);
    // 横にスクロールする列と、data-noswipe の付いた所を、その場で置いて確かめる
    await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const row = document.createElement("div");
      row.id = "side-row";
      row.style.cssText = "overflow-x:auto;white-space:nowrap;width:200px";
      row.innerHTML = `<span style="display:inline-block;width:900px;height:40px">チップの列</span>`;
      const fenced = document.createElement("div");
      fenced.id = "fenced";
      fenced.dataset.noswipe = "";
      fenced.style.cssText = "width:200px;height:40px";
      main.prepend(row, fenced);
    });
    await swipe(page, -200, 0, "#side-row span");
    await swipe(page, 200, 0, "#fenced");
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/inbox$/);
    await context.close();
  });

  test("履歴と設定のタイルの一覧では、今までどおり3枚の行き来になる", async ({ browser }) => {
    const context = await touchContext(browser);
    const page = await context.newPage();
    await page.goto("/me");
    await expect(async () => {
      await swipe(page, -160);
      await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/, { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await page.goto("/me");
    await expect(async () => {
      await swipe(page, 160);
      await expect(page).toHaveURL(/\/minna$/, { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await context.close();
  });
});

test.describe("今日の3人のモーダル", () => {
  async function stroke(page: Page, dx: number, dy: number) {
    const box = (await page.getByRole("dialog", { name: "今日の3人" }).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + 40;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
    await page.mouse.up();
  }

  async function openModal(browser: Browser) {
    const context = await touchContext(browser);
    await context.clearCookies({ name: "koekata_today_seen" });
    const page = await context.newPage();
    await page.goto("/minna");
    const modal = page.getByRole("dialog", { name: "今日の3人" });
    await expect(modal).toBeVisible();
    return { context, page, modal };
  }

  test("0-3p：カードの上の横の払いはカードを消すだけで、画面は移らない", async ({ browser }) => {
    const { context, page, modal } = await openModal(browser);
    await stroke(page, -200, 0);
    await expect(page).toHaveURL(/\/minna$/);
    await expect(modal).toBeVisible();
    await stroke(page, 200, 0);
    await expect(page).toHaveURL(/\/minna$/);
    await context.close();
  });

  test("おしまいの先へ左へ払うとホームへ戻る", async ({ browser }) => {
    const { context, page, modal } = await openModal(browser);
    const next = modal.getByRole("button", { name: "次へ" });
    await expect(async () => {
      while (await next.isEnabled()) await next.click();
      await expect(modal.getByRole("heading", { name: "おしまい" })).toBeVisible({ timeout: 1000 });
    }).toPass();
    await stroke(page, -200, 0);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await context.close();
  });

  test("下へなでおろすと、今までどおり閉じて「みんな」に残る", async ({ browser }) => {
    const { context, page, modal } = await openModal(browser);
    await stroke(page, 0, 240);
    await expect(modal).toHaveCount(0);
    await expect(page).toHaveURL(/\/minna$/);
    await context.close();
  });
});
