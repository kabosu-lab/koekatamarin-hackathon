import { expect, type Page, test } from "@playwright/test";

// 0-2y：パソコンと iPad の横では、どの画面でも3列（左＝履歴と設定、中央＝話す、右＝みんな）。奥の画面は属する列の中で開く

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
});

const LEFT = ["/me", "/me?open=daily", "/me?open=lookback", "/me?open=goals", "/me?open=thanks", "/me?open=partner", "/me?open=settings", "/daily", "/lookback", "/yousu", "/walk", "/soudan"];
const RIGHT = ["/minna", "/inbox", "/chie", "/chie/new", "/chie/knowledge-quick-quiz", "/today", "/study/room", "/people/ogawara", "/sakura", "/koho", "/teams"];

/** 3列が並んでいる：左の列・真ん中の話す画面・右の列が、左から順に横に並ぶ */
async function expectThreeColumns(page: Page) {
  await expect(page.locator(".device-row")).toBeVisible();
  const boxes = await page.evaluate(() =>
    [".wide-panel[data-side=left]", "main.retro-home", ".wide-panel[data-side=right]"].map((selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { left: box.left, right: box.right, width: box.width } : null;
    }),
  );
  const [left, center, right] = boxes;
  expect(left && center && right, "3つの列がある").toBeTruthy();
  expect(left!.width).toBeGreaterThan(200);
  expect(right!.width).toBeGreaterThan(200);
  expect(left!.right).toBeLessThanOrEqual(center!.left + 1);
  expect(center!.right).toBeLessThanOrEqual(right!.left + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1180, height: 820 },
]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
    });

    test("ホームは最初の描画から3列（読み込みの途中でも1列にならない）", async ({ page }) => {
      // 中の画面が来る前に、列の枠だけで3列になっている
      await page.route(/\/(me|minna)(\?|$)/, async (route) => {
        if (route.request().resourceType() === "document") await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.continue();
      });
      await page.goto("/", { waitUntil: "commit" });
      await expectThreeColumns(page);
      await page.unrouteAll({ behavior: "ignoreErrors" });
    });

    for (const [side, paths] of [
      ["left", LEFT],
      ["right", RIGHT],
    ] as const) {
      test(`${side === "left" ? "履歴と設定" : "みんな"}の奥の画面を URL で直接開いても、3列のままその列の中に開く`, async ({ page }) => {
        test.setTimeout(240_000);
        for (const path of paths) {
          await page.goto(path);
          await expect(page, path).toHaveURL(new RegExp(`/\\?${side}=`));
          await expectThreeColumns(page);
          const frame = page.locator(`.wide-panel[data-side=${side}] iframe`);
          await expect(frame, path).toHaveAttribute("src", path);
          // 列の中に、その画面が出ている（欄の印が付いている）
          const inner = page.frameLocator(`.wide-panel[data-side=${side}] iframe`);
          await expect(inner.locator("html[data-embed=true]"), path).toHaveCount(1);
          await expect(inner.locator("main").first(), path).toBeVisible();
          // 真ん中は話す画面のまま
          await expect(page.getByRole("button", { name: "押し続けて話す" })).toBeVisible();
        }
      });
    }

    test("列の中で奥の画面へ進んでも、3列は保たれ、URL はホームのまま", async ({ page }) => {
      await page.goto("/");
      const right = page.frameLocator('iframe[title="みんな"]');
      await right.getByRole("link", { name: /受信箱/ }).first().click();
      await expect(right.getByRole("heading", { name: "受信箱" })).toBeVisible();
      await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
      await expectThreeColumns(page);
      const left = page.frameLocator('iframe[title="履歴と設定"]');
      await left.locator('a[data-tile="thanks"]').click();
      await expect(left.locator("main[data-me=thanks]")).toBeVisible();
      await expectThreeColumns(page);
    });

    test("広い画面ではスワイプでホームへ戻らない（列の中の奥の画面は「戻る」で閉じる）", async ({ page }) => {
      await page.goto("/");
      const right = page.frameLocator('iframe[title="みんな"]');
      await right.getByRole("link", { name: /受信箱/ }).first().click();
      await expect(right.getByRole("heading", { name: "受信箱" })).toBeVisible();
      const iframe = page.locator('iframe[title="みんな"]');
      const before = await iframe.evaluate((element: HTMLIFrameElement) => element.contentWindow!.location.pathname);
      await iframe.evaluate((element: HTMLIFrameElement) => {
        const doc = element.contentDocument!;
        const target = doc.querySelector("main h1") ?? doc.body;
        const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 200 });
        target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch(250)], changedTouches: [touch(250)] }));
        target.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [touch(40)] }));
      });
      await page.waitForTimeout(800);
      expect(await iframe.evaluate((element: HTMLIFrameElement) => element.contentWindow!.location.pathname)).toBe(before);
      await expect(right.getByRole("link", { name: /みんな/ }).first()).toBeVisible();
    });
  });
}

test("iPhone の横（844×390）では「縦にして使ってね」の絵が出て、3列にならない", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/inbox");
  await expect(page).toHaveURL(/\/inbox$/);
  const hint = page.getByRole("status", { name: "縦にして使ってね" });
  await expect(hint).toBeVisible();
  await expect(page.locator(".wide-panel").first()).toBeHidden();
  await page.goto("/");
  await expect(hint).toBeVisible();
  await expect(page.locator(".wide-panel[data-side=left]")).toBeHidden();
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("動きを減らす設定では、縦にしての絵は回らない", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("status", { name: "縦にして使ってね" })).toBeVisible();
  expect(await page.locator(".rotate-hint-phone").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await context.close();
});

test("iPad の縦（820×1180）では1画面のまま。絵も3列も出ない", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/inbox");
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole("heading", { name: "受信箱" })).toBeVisible();
  await expect(page.getByRole("status", { name: "縦にして使ってね" })).toBeHidden();
  await page.goto("/");
  await expect(page.locator(".wide-panel[data-side=right]")).toBeHidden();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "押し続けて話す" })).toBeVisible();
});

test("スマホの縦では、絵も3列も出ない", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status", { name: "縦にして使ってね" })).toBeHidden();
  await expect(page.locator("iframe")).toHaveCount(0);
});
