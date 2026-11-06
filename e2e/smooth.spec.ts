import { expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 0-1i：カクつきの主因を戻さない。スクロールする要素に filter や mask を掛けると、スクロールのたびに全部描き直される
test.use({ storageState: { cookies: PROMISE_SEEN, origins: [] } });

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" }]);
  // 光や動きは「動きを減らす」でない端末にだけ付くので、その形で確かめる
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

/** スクロールする要素のうち、filter・mask・行数の切り取りが掛かっているものを返す。 */
async function heavyScrollers(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => /auto|scroll/.test(getComputedStyle(element).overflowY))
      .map((element) => {
        const style = getComputedStyle(element);
        const mask = style.maskImage || style.getPropertyValue("-webkit-mask-image") || "none";
        return { name: `${element.tagName.toLowerCase()}.${element.className}`, filter: style.filter, mask };
      })
      .filter((found) => found.filter !== "none" || found.mask !== "none"),
  );
}

test("話す画面：スクロールする要素にも 3D の窓にも filter・mask が無い（会話の前と後）", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".talk.device")).toBeVisible();
  expect(await heavyScrollers(page)).toEqual([]);
  // 聞いている間の光も、パートナーの絵に filter を掛けずに付ける
  await page.locator(".talk.device").evaluate((talk) => talk.setAttribute("data-state", "listening"));
  await expect(page.locator(".dolphin").first()).toHaveCSS("filter", "none");

  await page.getByLabel("パートナーに書く").fill("今日の授業、急に静かになった瞬間があって");
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  expect(await heavyScrollers(page)).toEqual([]);
});

test("みんな：スクロールに filter・mask が無く、本文は行数で切らない", async ({ page }) => {
  await page.goto("/minna");
  await expect(page.locator(".minna-feed-body").first()).toBeVisible();
  expect(await heavyScrollers(page)).toEqual([]);
  const clamps = await page.locator(".minna-feed-body, .minna-feed-reply").evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).getPropertyValue("-webkit-line-clamp")),
  );
  expect(clamps.filter((value) => value !== "none")).toEqual([]);
});

test("スワイプで画面ごと動く間は、機器の大きな影を消す", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/");
  const home = page.locator(".retro-home");
  await expect(home).not.toHaveCSS("box-shadow", "none");
  await page.evaluate(() => (document.documentElement.dataset.swiping = "true"));
  await expect(home).toHaveCSS("box-shadow", "none");
});

test("会話の前は上の端を勾配で消し、会話中は消さない（mask を使わない）", async ({ page }) => {
  await page.goto("/");
  const log = page.getByRole("log");
  const edge = () => log.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return { display: style.display, position: style.position, height: style.height };
  });
  expect(await edge()).toEqual({ display: "block", position: "sticky", height: "14px" });
  await page.getByLabel("パートナーに書く").fill("こんにちは、ちょっと相談があるんだけど");
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(log.locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  expect((await edge()).display).toBe("none");
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`窓の 3D は大きさが変わったときだけ測り直して描く（動きを減らす：${reducedMotion}）`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion });
    // 自動テストでは静止画になるので、3D を明示して描かせる
    await page.addInitScript(() => localStorage.setItem("koekata_3d", "on"));
    await page.goto("/");
    await expect(page.locator(".dolphin").first()).toBeVisible();
    const canvas = page.locator(".dolphin canvas");
    await canvas.waitFor({ timeout: 5_000 }).catch(() => undefined);
    // WebGL2 が使えない環境では静止画に戻るので確かめられない
    test.skip((await canvas.count()) === 0, "WebGL2 が使えない");
    const size = () => canvas.evaluate((element: HTMLCanvasElement) => element.width);
    await expect.poll(size).toBeGreaterThan(1);
    const before = await size();
    await page.setViewportSize({ width: 820, height: 1180 });
    await expect.poll(size).not.toBe(before);
    expect(errors).toEqual([]);
  });
}
