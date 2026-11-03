import { expect, type Page, test } from "@playwright/test";

async function switchTo(page: Page, name: string) {
  await page.getByLabel("使う人").selectOption({ label: name });
  await page.getByRole("button", { name: "切り替え" }).click();
  await expect(page.getByLabel("使う人")).toHaveValue(/.+/);
}

test("先生が投稿すると、生徒の画面に届き、いいねと返信で応えられる", async ({ page }) => {
  const body = `テストの投稿 ${test.info().testId}`;

  await page.goto("/teams?channel=study");
  await page.getByLabel("新しい投稿").fill(body);
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  const post = page.getByRole("article").filter({ hasText: body });
  await expect(post).toContainText("佐伯 みどり");
  // 自分の投稿にはいいねのボタンを出さない
  await expect(post.getByRole("button", { name: /いいね/ })).toHaveCount(0);

  await switchTo(page, "青木 ひより（2年）");
  const seen = page.getByRole("article").filter({ hasText: body });
  await seen.getByRole("button", { name: "いいね 0" }).click();
  await expect(seen.getByRole("button", { name: "いいね 1" })).toHaveAttribute("aria-pressed", "true");

  await seen.getByLabel("返信").fill("ありがとうございます");
  await seen.getByRole("button", { name: "返信", exact: true }).click();
  await expect(seen.locator(".reply")).toContainText("ありがとうございます");
  await expect(seen.locator(".reply")).toContainText("青木 ひより");
});

test("生徒には職員室のチャネルが見えず、URL を直しても開けない", async ({ page }) => {
  await page.goto("/teams?channel=staffroom");
  await expect(page.getByRole("heading", { name: "職員室" })).toBeVisible();

  await switchTo(page, "中村 結衣（1年・吹奏楽部）");
  await expect(page.getByRole("link", { name: "職員室" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "職員室" })).toHaveCount(0);

  await page.goto("/teams?channel=staffroom");
  await expect(page.getByRole("heading", { name: "全校のお知らせ" })).toBeVisible();
  await expect(page.getByText("席替えのことで")).toHaveCount(0);
});

test("スマホ幅で横にはみ出さない", async ({ page }) => {
  await page.goto("/teams?channel=staffroom");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("スマホ幅でも、使う人の名前が読めて、選んだチャネルが画面に入っている", async ({ page }) => {
  await page.goto("/teams?channel=staffroom");

  const select = page.getByLabel("使う人");
  const colors = await select.evaluate((element) => {
    const style = getComputedStyle(element);
    return { text: style.color, background: style.backgroundColor };
  });
  expect(colors.text).not.toBe(colors.background);

  await expect(page.getByRole("link", { name: "職員室" })).toBeInViewport({ ratio: 1 });
});
