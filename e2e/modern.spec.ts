import { expect, type Page, test } from "@playwright/test";

// 初めて開く人は Cookie を持たない
test.use({ storageState: { cookies: [], origins: [] } });

const PAGES = ["/", "/minna", "/me", "/today", "/chie", "/inbox", "/teams", "/study", "/study/room", "/people/noda", "/daily"];
const DECORATION = ".avatar-image, .sticker, .speaker, .petal, .sakura-scene, .study-room, .gathering, .event-banner, .ribbons, .ribbon-mark, .gift-egg, .companion-list";

async function noDecoration(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator(`:is(${DECORATION}):visible`), path).toHaveCount(0);
  expect(await page.locator("img:visible").count(), path).toBe(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, path).toBe(0);
}

test("初めはモダンで、分身も飾りも絵も、どの画面にも出ない", async ({ page }) => {
  await page.goto("/");
  expect(await page.locator("html").getAttribute("data-theme")).toBe("modern");
  for (const path of PAGES) await noDecoration(page, path);
});

for (const [width, height] of [
  [768, 1024],
  [1280, 800],
] as const) {
  test(`${width}px でも、モダンでは飾りが出ず、はみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const path of PAGES) await noDecoration(page, path);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "今年のやり取り" })).toBeVisible();
    await expect(page.getByRole("region", { name: "分身と桜" })).toHaveCount(0);
  });
}

test("みんなの画面は、絵の代わりに数字と文を出す", async ({ page }) => {
  await page.goto("/minna");
  await expect(page.getByRole("region", { name: "今年のやり取り" })).toContainText("今年、校内で人に届いたやり取り");
  await expect(page.getByRole("link", { name: "春を見る" })).toHaveCount(0);
});

test("送るとかたまりは出ず、話した一行がすっと飛んで「届きました」と出る", async ({ page }) => {
  const words = `静かに届く言葉 ${test.info().testId}`;
  await page.goto("/");
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill(words);
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "言葉にして送る" }).click();
  await page.getByRole("button", { name: "本人として送る" }).click();
  await expect(page.locator(".send-line .line-words")).toHaveText(words);
  await expect(page.locator(".send-line .line-reached")).toHaveText("届きました");
  await expect(page.locator(".send-burst")).toHaveCount(0);
  await expect(page.locator(".send-line")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator(".sent")).toBeVisible();
});

test("最初の画面から切り替えられ、ポップでは分身が出て、モダンに戻せる", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ポップに", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "pop");
  await expect(page.locator(".speaker")).toBeVisible();
  await page.getByRole("button", { name: "モダンに", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "modern");
  await expect(page.locator(".speaker")).toHaveCount(0);
});

test("じぶんの画面に、ポップへの入口が一行で置いてある", async ({ page }) => {
  await page.goto("/me");
  await expect(page.locator(".pop-note")).toContainText("裏で育っています");
  await page.getByRole("button", { name: "ポップに切り替える" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "pop");
  await expect(page.getByRole("region", { name: "相棒", exact: true })).toBeVisible();
});
