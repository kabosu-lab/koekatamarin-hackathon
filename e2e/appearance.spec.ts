import { expect, type Page, test } from "@playwright/test";

const box = (page: Page) => page.getByRole("button", { name: "話しかける" }).boundingBox();

async function choose(page: Page, label: string) {
  await page.goto("/me");
  await page.getByRole("region", { name: "見た目" }).getByRole("button", { name: label }).click();
  await expect(page.getByRole("region", { name: "見た目" }).getByRole("button", { name: label })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

test("きせかえを変えると色は変わり、配置は変わらず、開き直しても残る", async ({ page }) => {
  await page.goto("/");
  const before = await box(page);
  const color = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const original = await color();

  await choose(page, "ゲーム");
  await page.goto("/");
  expect(await color()).not.toBe(original);
  expect(await page.locator("html").getAttribute("data-theme")).toBe("game");
  expect(await box(page)).toEqual(before);

  await page.reload();
  expect(await page.locator("html").getAttribute("data-theme")).toBe("game");

  await choose(page, "くっきり");
  await page.goto("/");
  expect(await box(page)).toEqual(before);
});

test("文字を大きくしても、どの画面も横にはみ出さない", async ({ page }) => {
  await choose(page, "とても大きい");
  for (const path of ["/", "/me", "/inbox", "/today", "/minna", "/daily", "/study", "/soudan", "/teams"]) {
    await page.goto(path);
    expect(await page.locator("html").getAttribute("data-size")).toBe("xlarge");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBe(0);
  }
});

test("音は初めは消えていて、選ぶと入る", async ({ page }) => {
  await page.goto("/");
  expect(await page.locator("html").getAttribute("data-sound")).toBe("off");
  await choose(page, "音あり");
  expect(await page.locator("html").getAttribute("data-sound")).toBe("on");
});

async function send(page: Page, words: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill(words);
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "言葉にして送る" }).click();
  await page.getByRole("button", { name: "本人として送る" }).click();
}

test("送ると言葉が飛び、花びらになって、消える", async ({ page }) => {
  const words = `飛ばす言葉 ${test.info().testId}`;
  await send(page, words);
  await expect(page.locator(".send-burst .blob")).toHaveText(words);
  await expect(page.locator(".send-burst .burst-petal").first()).toBeAttached();
  await expect(page.locator(".send-burst")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator(".sent")).toBeVisible();
});

test("動きを減らす設定では、飛ばさない", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await send(page, `動かさない言葉 ${test.info().testId}`);
  await expect(page.locator(".sent")).toBeVisible();
  await expect(page.locator(".send-burst")).toBeHidden();
});

test("分身が今日のカードと校内チャネルでも見える", async ({ page }) => {
  await page.goto("/today");
  await expect(page.locator(".today-card .avatar-image")).toBeVisible();
  await page.goto("/teams?channel=making");
  await expect(page.getByRole("article").first().locator(".avatar-image").first()).toBeVisible();
});
