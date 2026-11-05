import { expect, type Page, test } from "@playwright/test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

async function attachAndDraft(page: Page, words: string) {
  await page.goto("/");
  await page.locator("label.device-side input").setInputFiles({ name: "賞状.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("region", { name: "付けたファイル" })).toBeVisible();
  await page.getByLabel("相棒に書く").fill(words);
  await page.getByRole("button", { name: "相棒へ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "とどける" }).click();
  await expect(page.getByRole("group", { name: "添付の確認" })).toBeVisible();
}

test("付ける、話す、下書き、気づき、本人が確かめて送る、添付つきで届く", async ({ page }) => {
  const words = `賞状をもらいました ${test.info().testId}`;
  await attachAndDraft(page, words);

  const check = page.getByRole("group", { name: "添付の確認" });
  await expect(check.getByRole("heading", { name: "隠しますか？" })).toBeVisible();
  await expect(check).toContainText("相棒は見逃すことがあります。最後に確かめるのはあなたです");
  await expect(check.getByRole("img")).toBeVisible();

  // 気づきがあるうちは、本人が選ぶまで送れない
  const send = page.getByRole("button", { name: "本人として送る" });
  await expect(send).toBeDisabled();
  await check.getByRole("button", { name: "このまま送る" }).click();
  await send.click();
  await expect(page.locator(".sent")).toBeVisible();
  await expect(page.getByRole("region", { name: "付けたファイル" })).toHaveCount(0);

  await page.locator(".sent a").first().click();
  const post = page.locator("article.post", { hasText: words });
  const image = post.getByRole("img", { name: /添付の写真/ });
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test("別のファイルにすると、話す画面に戻り、前のファイルは外れる", async ({ page }) => {
  await attachAndDraft(page, `付け直す ${test.info().testId}`);
  await page.getByRole("button", { name: "別のファイルにする" }).click();
  await expect(page.locator(".notice")).toContainText("もう一度付けてください");
  await expect(page.locator("label.device-side")).toBeVisible();
  await expect(page.getByRole("region", { name: "付けたファイル" })).toHaveCount(0);
});

test("写真や PDF でないものは、拡張子を偽っても付けられない", async ({ page }) => {
  await page.goto("/");
  await page.locator("label.device-side input").setInputFiles({
    name: "賞状.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
  });
  await expect(page.locator(".notice")).toContainText("写真（JPEG、PNG、WebP）か PDF");
  await expect(page.getByRole("region", { name: "付けたファイル" })).toHaveCount(0);
});

test("配信の入口は、種類の推測を止め、読めない人には見せない", async ({ page, browser }) => {
  await page.goto("/");
  await page.locator("label.device-side input").setInputFiles({ name: "賞状.png", mimeType: "image/png", buffer: PNG });
  const src = await page.getByRole("region", { name: "付けたファイル" }).getByRole("img").getAttribute("src");
  const response = await page.request.get(src ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-type"]).toBe("image/png");

  // 別の人物（Cookie で切り替えた別の文脈）には、送る前のものは見えない
  const other = await browser.newContext({ baseURL: page.url(), extraHTTPHeaders: {} });
  await other.addCookies([{ name: "koekata_person", value: "aoki", url: new URL(page.url()).origin }]);
  const denied = await other.request.get(new URL(src ?? "", page.url()).toString());
  expect(denied.status()).toBe(404);
  await other.close();
});

test("スマホ幅で、添付の確認が横にはみ出さない", async ({ page }) => {
  await attachAndDraft(page, `はみ出さない ${test.info().testId}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
