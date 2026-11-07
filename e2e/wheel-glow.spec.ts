import { expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 話す画面を開くと、輪がじんわり光って誘う（data-invite="breathe"）。開いて 1.2 秒以内に始まり、3回で終わる。
// 初めての指の手ほどきが出るときは、それが終わってから光る。

const SIZES = [
  { name: "iPhone", viewport: { width: 390, height: 844 }, isMobile: true },
  { name: "iPad 縦", viewport: { width: 820, height: 1180 }, isMobile: false },
  { name: "iPad 横", viewport: { width: 1180, height: 820 }, isMobile: false },
  { name: "パソコン", viewport: { width: 1280, height: 800 }, isMobile: false },
];

/** 輪の光と手ほどきの出入りの時刻（ページを開いてからの ms）を記録する */
async function record(page: Page, hintSeen: boolean) {
  await page.addInitScript((seen) => {
    if (seen) localStorage.setItem("koekata_hint_wheel", "1");
    const times: Record<string, number> = {};
    (window as unknown as { glowTimes: Record<string, number> }).glowTimes = times;
    const watch = () => {
      const wheel = document.querySelector(".click-wheel");
      const now = performance.now();
      if (wheel && Object.keys(wheel).some((key) => key.startsWith("__reactProps")) && !times.ready) times.ready = now;
      if (wheel?.getAttribute("data-invite") === "breathe" && !times.glowOn) times.glowOn = now;
      if (times.glowOn && wheel?.getAttribute("data-invite") !== "breathe" && !times.glowOff) times.glowOff = now;
      const hint = document.querySelector(".wheel-hint");
      if (hint && !times.hintOn) times.hintOn = now;
      if (times.hintOn && !hint && !times.hintOff) times.hintOff = now;
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }, hintSeen);
}

const times = (page: Page) => page.evaluate(() => (window as unknown as { glowTimes: Record<string, number> }).glowTimes);

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.isMobile, storageState: { cookies: PROMISE_SEEN, origins: [] } });

    test(`${size.name}：開いて 1.2 秒以内に輪が光り始め、3回で終わる`, async ({ page }) => {
      await record(page, true);
      await page.goto("/");
      await expect.poll(async () => (await times(page)).glowOn ?? 0, { timeout: 5000 }).toBeGreaterThan(0);
      const t = await times(page);
      expect(t.glowOn - t.ready, `動き出せるようになってから光るまで ${Math.round(t.glowOn - t.ready)}ms`).toBeLessThanOrEqual(1200);
      await expect(page.locator(".click-wheel")).toHaveAttribute("data-invite", "breathe");
      // 2.8 秒 × 3回で外れる
      await expect(page.locator(".click-wheel")).not.toHaveAttribute("data-invite", "breathe", { timeout: 12_000 });
    });
  });
}

test.describe("初めての手ほどき", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: { cookies: PROMISE_SEEN, origins: [] } });

  test("指の手ほどきが出るときは、それが終わってから輪が光る", async ({ page }) => {
    test.setTimeout(60_000);
    await record(page, false);
    await page.goto("/");
    await expect(page.locator(".wheel-hint")).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await times(page)).glowOn ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
    const t = await times(page);
    expect(t.hintOff, "手ほどきが終わっている").toBeGreaterThan(0);
    expect(t.glowOn, `手ほどき ${Math.round(t.hintOn)}〜${Math.round(t.hintOff)}ms、光 ${Math.round(t.glowOn)}ms`).toBeGreaterThanOrEqual(t.hintOff);
  });
});
