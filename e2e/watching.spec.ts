import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

async function publish(page: Page, text: string) {
  const response = await page.request.post("/api/publish", { data: { text, channelId: "study" } });
  expect(response.ok()).toBe(true);
}

test("気になる投稿は先生にだけ確認を促し、先生が押すと職員室で共有される", async ({ page }) => {
  const words = `テストの投稿 使えない ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await publish(page, words);
  await page.goto("/teams?channel=study");
  const own = page.getByRole("article").filter({ hasText: words });
  await expect(own.locator(".needs-look")).toHaveCount(0);
  await expect(own.getByRole("button", { name: "教職員で共有する" })).toHaveCount(0);

  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await page.goto("/teams?channel=study");
  const post = page.getByRole("article").filter({ hasText: words });
  await expect(post.locator(".needs-look")).toContainText("判断するのは先生です");
  await post.getByRole("button", { name: "教職員で共有する" }).click();
  await expect(post.locator(".needs-look")).toContainText("共有済み");

  await page.goto("/teams?channel=staffroom");
  await expect(page.getByRole("article").filter({ hasText: words })).toContainText("一人で抱えず");

  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await page.goto("/teams?channel=staffroom");
  await expect(page.getByText(words)).toHaveCount(0);
});

test("桜の場面は時間帯を持つ", async ({ page }) => {
  await page.goto("/minna");
  await expect(page.locator(".sakura-scene")).toHaveAttribute("data-time", /morning|day|evening|night/);
});
