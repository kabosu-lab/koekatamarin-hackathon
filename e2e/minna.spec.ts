import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

// 0-1k：みんなの画面。ページ全体が1つのスクロール、桜は上で帯に縮み、返信はその場で

test("スクロールすると桜が細い帯に縮んで上に残り、帯を押すと桜が開く", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  const band = page.getByRole("button", { name: "桜を大きく開く" });
  await expect(scroller).toHaveAttribute("data-shrunk", "false");

  // 画面の準備ができるまで、スクロールし直す
  await expect(async () => {
    await scroller.evaluate((element) => element.scrollTo(0, 600));
    await expect(scroller).toHaveAttribute("data-shrunk", "true", { timeout: 1000 });
  }).toPass();

  // 帯は 48px ほどで、窓の上の端に残る
  const box = await scroller.boundingBox();
  const bandBox = await band.boundingBox();
  expect(bandBox!.height).toBeLessThanOrEqual(56);
  expect(Math.abs(bandBox!.y - box!.y)).toBeLessThanOrEqual(10);
  await expect(band).toContainText(/葉\d+枚/);

  // 投稿が画面の大半を使う（上に残るのは帯と札の列だけ）
  const header = await page.locator(".minna-chip-row").boundingBox();
  expect(header!.y + header!.height - box!.y).toBeLessThan(box!.height * 0.2);

  await band.click();
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(scroller).toHaveAttribute("data-shrunk", "false");
});

test("カードの本文は途中で切らず全部出し、新しい投稿の欄は置かない", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  await expect(scroller.getByRole("article").first()).toBeVisible();
  const clipped = await page.locator(".minna-post-body").evaluateAll((bodies) =>
    bodies.filter((body) => {
      const style = getComputedStyle(body);
      return body.scrollHeight > body.clientHeight + 1 || (style.webkitLineClamp !== "none" && style.webkitLineClamp !== "");
    }).length,
  );
  expect(clipped).toBe(0);
  // 欄の中に入力欄はない。新しく話すのは「話す」画面から
  await expect(scroller.getByRole("textbox")).toHaveCount(0);
  await expect(scroller.getByRole("link", { name: "新しく話す →" })).toHaveAttribute("href", "/");
  // 中に小さなスクロール枠を作らない（スクロールするのは窓1つ）
  const inner = await scroller.evaluate(
    (root) =>
      [...root.querySelectorAll("*")].filter((element) => {
        const style = getComputedStyle(element);
        return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
      }).length,
  );
  expect(inner).toBe(0);
});

test("返信を押すと下から欄がせり上がり、やめると閉じ、送ると返事がカードに並ぶ", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  const reply = scroller.getByRole("button", { name: "返信", exact: true }).first();
  const sheet = page.getByRole("dialog", { name: /さんへの返信$/ });

  await expect(async () => {
    await reply.click();
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
  // 欄は画面の下の端にある
  const viewport = page.viewportSize()!;
  const sheetBox = await sheet.boundingBox();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height)).toBeGreaterThanOrEqual(viewport.height - 2);
  expect(sheetBox!.width).toBeGreaterThan(300);
  await sheet.getByRole("button", { name: "やめる" }).click();
  await expect(sheet).toHaveCount(0);

  const words = `その場の返信 ${test.info().testId}`;
  await reply.click();
  await sheet.getByLabel("返信").fill(words);
  await sheet.getByRole("button", { name: "返信する" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(scroller.getByText(words)).toBeVisible();
});

test("チャネルの札で投稿を絞れ、教職員だけの札は生徒には出ない", async ({ page }) => {
  await page.goto("/minna");
  const chips = page.getByRole("group", { name: "チャネルで絞る" });
  const chip = chips.getByRole("button").nth(1);
  const name = (await chip.textContent()) ?? "";
  await expect(async () => {
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass();
  const scroller = page.getByRole("region", { name: "みんな" });
  await expect(scroller.getByRole("article").first()).toBeVisible();
  // 絞ったあとに見えている投稿だけを見る（隠れた投稿も DOM には残る）
  for (const head of await scroller.locator("li:not([hidden]) article header.minna-post-head small").all()) {
    await expect(head).toContainText(name);
  }
  await chips.getByRole("button", { name: "すべて" }).click();
  await expect(chips.getByRole("button", { name: "すべて" })).toHaveAttribute("aria-pressed", "true");

  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/minna");
  await expect(page.getByRole("group", { name: "チャネルで絞る" }).getByRole("button", { name: "職員室" })).toHaveCount(0);
});

test("iPad の横向きと PC では、左に桜、右に投稿の2列で、桜は縮まない", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  const link = page.getByRole("link", { name: "校内の桜" });
  const post = scroller.getByRole("article").first();
  const sakura = await link.boundingBox();
  const first = await post.boundingBox();
  expect(sakura!.x + sakura!.width).toBeLessThanOrEqual(first!.x + 1);
  await page.locator(".minna-column").evaluate((column) => column.scrollTo(0, 800));
  await expect(scroller).toHaveAttribute("data-shrunk", "false");
  await expect(link).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
