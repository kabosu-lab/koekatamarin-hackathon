import { type Browser, expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 0-3i：左右の端のつまみの棒（押すとその側の画面へ）、初めてだけの揺れと指の印、輪のまわりの目盛りの点

const SIZES = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad 縦", width: 820, height: 1180 },
] as const;

async function context(browser: Browser, viewport: { width: number; height: number }, { seen }: { seen: boolean }) {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport });
  await context.addCookies(PROMISE_SEEN);
  if (seen)
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

const stripReady = (page: Page) => expect(page.locator("html[data-strip-ready]")).toHaveCount(1, { timeout: 30_000 });

for (const size of SIZES) {
  test(`${size.name}：左右の端に棒が見え、押すとその側の画面へ帯で移る`, async ({ browser }) => {
    const ctx = await context(browser, size, { seen: true });
    const page = await ctx.newPage();
    await page.goto("/");
    const left = page.getByRole("button", { name: "履歴と設定へ" });
    const right = page.getByRole("button", { name: "みんなへ" });
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
    // 画面の左右の端、上下のまん中（0-3o）
    const l = (await left.boundingBox())!;
    const r = (await right.boundingBox())!;
    expect(l.x).toBeLessThan(1);
    expect(Math.abs(r.x + r.width - size.width)).toBeLessThan(1);
    for (const handle of [l, r]) expect(Math.abs(handle.y + handle.height / 2 - size.height / 2)).toBeLessThan(3);
    await page.screenshot({ path: test.info().outputPath(`棒-${size.name}.png`) });

    await stripReady(page);
    await right.click();
    await expect(page).toHaveURL(/\?pane=right$/);
    await expect(page.locator(".device-row")).toHaveAttribute("data-pane", "right");
    await page.goto("/");
    await stripReady(page);
    // キーボードでも押せる
    await left.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?pane=left$/);
    await expect(page.locator(".device-row")).toHaveAttribute("data-pane", "left");
    await ctx.close();
  });

  test(`${size.name}：初めて開いたときだけ、棒が揺れて隣が覗き、指の印が輪をなぞる。2回目は出ない`, async ({ browser }) => {
    const ctx = await context(browser, size, { seen: false });
    // 本体がどれだけ横へ動いたか（隣の画面の端の覗き）を記録する
    await ctx.addInitScript(() => {
      const w = window as typeof window & { __maxShift?: number };
      w.__maxShift = 0;
      const sample = () => {
        const home = document.querySelector<HTMLElement>(".retro-home");
        if (home?.style.transform) w.__maxShift = Math.max(w.__maxShift ?? 0, Math.abs(new DOMMatrixReadOnly(home.style.transform).m41));
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator(".click-wheel .wheel-ticks > i")).toHaveCount(24);
    await expect(page.locator("html[data-edge-hint='shown']")).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator(".edge-handle[data-nudge]")).toHaveCount(2);
    await page.screenshot({ path: test.info().outputPath(`揺れ-${size.name}.png`) });
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __maxShift?: number }).__maxShift ?? 0), { timeout: 5000 }).toBeGreaterThan(10);
    // 覗いたあとは話す画面に戻っている
    await expect(page.locator(".device-row")).not.toHaveAttribute("data-pane", /./);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await expect(page.locator(".wheel-hint")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: test.info().outputPath(`指の印-${size.name}.png`) });
    await expect(page.locator(".wheel-hint")).toHaveCount(0, { timeout: 5000 });

    await page.reload();
    await stripReady(page);
    await page.waitForTimeout(5000);
    await expect(page.locator("html[data-edge-hint]")).toHaveCount(0);
    await expect(page.locator("html[data-wheel-hint]")).toHaveCount(0);
    await expect(page.locator(".edge-handle[data-nudge]")).toHaveCount(0);
    await expect(page.locator(".wheel-hint")).toHaveCount(0);
    await ctx.close();
  });
}

test("3列（横向きで高さ 600 以上）では棒を出さない", async ({ browser }) => {
  const ctx = await context(browser, { width: 1180, height: 820 }, { seen: false });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator(".click-wheel .wheel-ticks > i")).toHaveCount(24);
  await expect(page.locator(".edge-handle")).toHaveCount(2);
  for (const handle of await page.locator(".edge-handle").all()) await expect(handle).toBeHidden();
  await page.waitForTimeout(3000);
  await expect(page.locator("html[data-edge-hint]")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("3列.png") });
  await ctx.close();
});

test("動きを減らす設定では、揺れも指の印も出さない", async ({ browser }) => {
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await ctx.addCookies(PROMISE_SEEN);
  const page = await ctx.newPage();
  await page.goto("/");
  await page.waitForTimeout(6000);
  await expect(page.locator("html[data-edge-hint]")).toHaveCount(0);
  await expect(page.locator(".wheel-hint")).toHaveCount(0);
  await expect(page.locator(".edge-handle").first()).toBeVisible();
  await ctx.close();
});

test("本当の初回（印も cookie もない）：注意のカードを読んで閉じたあとで、棒の覗きと指の印が出る", async ({ browser }) => {
  // 設定の storageState（約束を読んだ印の cookie）を使わず、まっさらな人として開く
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
  await ctx.addInitScript(() => {
    const w = window as typeof window & { __maxShift?: number };
    w.__maxShift = 0;
    const sample = () => {
      const home = document.querySelector<HTMLElement>(".retro-home");
      if (home?.style.transform) w.__maxShift = Math.max(w.__maxShift ?? 0, Math.abs(new DOMMatrixReadOnly(home.style.transform).m41));
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const page = await ctx.newPage();
  await page.goto("/");
  const card = page.getByRole("dialog", { name: "最初にお伝えすること" });
  await expect(card).toBeVisible();
  // カードを読んでいる間は出さない（帯が整う時間も、手ほどきの待ち時間も過ぎるまで読む）
  await page.waitForTimeout(20_000);
  await expect(page.locator("html[data-edge-hint]")).toHaveCount(0);
  await expect(page.locator(".wheel-hint")).toHaveCount(0);
  // 閉じるタップでは取り消さない
  await card.getByRole("button", { name: "わかった" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator("html[data-edge-hint='shown']")).toHaveCount(1, { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __maxShift?: number }).__maxShift ?? 0), { timeout: 5000 }).toBeGreaterThan(10);
  await expect(page.locator(".wheel-hint")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: test.info().outputPath("本当の初回-指の印.png") });
  await ctx.close();
});
