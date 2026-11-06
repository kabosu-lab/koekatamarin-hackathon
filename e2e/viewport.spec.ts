import { expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 0-2e：キーボードが開いたら（見えている高さが縮んだら）、話す画面をその高さに合わせ、入力欄をキーボードのすぐ上に置く。
// 実機のキーボードは出せないので、ページの中の visualViewport を偽って高さを変える。生徒の初期のレトロで見る
test.use({ storageState: { cookies: PROMISE_SEEN, origins: [] } });

const TRIAL_PORT = Number(process.env.KOEKATA_E2E_PORT ?? 3100) + 1;

async function fakeViewport(page: Page) {
  await page.addInitScript(() => {
    const fake = new EventTarget() as EventTarget & Record<string, unknown>;
    const state = { height: window.innerHeight, offsetTop: 0 };
    Object.defineProperties(fake, {
      height: { get: () => state.height },
      width: { get: () => window.innerWidth },
      offsetTop: { get: () => state.offsetTop },
      offsetLeft: { get: () => 0 },
      pageTop: { get: () => window.scrollY + state.offsetTop },
      pageLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, "visualViewport", { value: fake, configurable: true });
    (window as unknown as { setKeyboard: (height: number | null) => void }).setKeyboard = (height) => {
      state.height = height === null ? window.innerHeight : window.innerHeight - height;
      fake.dispatchEvent(new Event("resize"));
    };
  });
}

const setKeyboard = (page: Page, height: number | null) =>
  page.evaluate((h) => (window as unknown as { setKeyboard: (height: number | null) => void }).setKeyboard(h), height);

test("キーボードが開くと、話す画面は見えている高さに縮み、入力欄がそのすぐ上に来る。閉じると戻る", async ({ page }) => {
  await page.context().addCookies([{ name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" }]);
  await fakeViewport(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "retro");
  const input = page.getByLabel("パートナーに書く");
  await expect(input).toBeVisible();
  const full = page.viewportSize()!.height;
  const before = await page.evaluate(() => document.body.getBoundingClientRect().height);
  expect(Math.abs(before - full)).toBeLessThanOrEqual(1);

  const keyboard = 340;
  const visible = full - keyboard;
  await setKeyboard(page, keyboard);
  await expect(page.locator("html")).toHaveAttribute("data-keyboard", "open");
  await expect.poll(() => page.evaluate(() => document.body.getBoundingClientRect().height)).toBe(visible);

  // 入力欄は全部見えていて、下の端がキーボードのすぐ上
  const box = (await input.boundingBox())!;
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThanOrEqual(visible);
  expect(box.y + box.height).toBeGreaterThan(visible - 40);
  // 窓（パートナー）は上に残り、ホイールとボタンは打っている間だけ畳む
  const lcd = (await page.locator(".lcd").boundingBox())!;
  expect(lcd.y).toBeGreaterThanOrEqual(0);
  expect(lcd.height).toBeGreaterThan(40);
  expect(lcd.y + lcd.height).toBeLessThanOrEqual(box.y);
  await expect(page.locator(".device-controls")).toBeHidden();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // Enter で送れる
  await input.fill(`キーボードの上から送る ${test.info().testId}`);
  await input.press("Enter");
  await expect(input).toHaveValue("");

  await setKeyboard(page, null);
  await expect(page.locator("html")).not.toHaveAttribute("data-keyboard", "open");
  await expect.poll(() => page.evaluate(() => document.body.getBoundingClientRect().height)).toBe(full);
  await expect(page.locator(".device-controls")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--vvh"))).toBe("");
});

test("URL の帯が少し出入りするくらいでは、キーボードと見なさない", async ({ page }) => {
  await page.context().addCookies([{ name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" }]);
  await fakeViewport(page);
  await page.goto("/");
  await expect(page.getByLabel("パートナーに書く")).toBeVisible();
  await setKeyboard(page, 60);
  await page.waitForTimeout(100);
  await expect(page.locator("html")).not.toHaveAttribute("data-keyboard", "open");
  await expect(page.locator(".device-controls")).toBeVisible();
});

test("ホーム画面に追加する設定：viewport と manifest とアイコンが返る", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /interactive-widget=resizes-content/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]')).not.toHaveCount(0);

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const body = await manifest.json();
  expect(body).toMatchObject({ name: "こえかた", display: "standalone", start_url: "/" });

  for (const [path, width] of [
    ["/icon1", 512],
    ["/apple-icon", 180],
  ] as const) {
    const icon = await request.get(path);
    expect(icon.status(), path).toBe(200);
    expect(icon.headers()["content-type"], path).toContain("image/png");
    const png = await icon.body();
    // PNG の頭の IHDR に幅が入っている
    expect(png.readUInt32BE(16), path).toBe(width);
  }
});

test("試用版の合言葉の関所は、manifest とアイコンを止めない", async ({ playwright }) => {
  const trial = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${TRIAL_PORT}` });
  for (const path of ["/manifest.webmanifest", "/icon1", "/apple-icon"]) {
    const response = await trial.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(200);
  }
  expect((await trial.get("/", { maxRedirects: 0 })).status()).toBe(303);
  await trial.dispose();
});
