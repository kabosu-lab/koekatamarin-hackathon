import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

// 0-2b：履歴と設定の「これまで」。帯（第2段）と、押すと開くインフォグラフィック（第3段）

test("「これまで」の帯は、前に見たときから増えた数だけが転がり、増えていなければ動かない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/me");
  const band = page.getByRole("region", { name: "これまで" });
  await expect(band).toContainText(/届けた \d+/);
  await expect(band).toContainText(/ありがとう \d+/);

  // もう一度開いても、増えていなければ転がらない
  await page.goto("/me");
  await expect(band).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator(".me-so-far[data-rolling]")).toHaveCount(0);
  await expect(band.locator(".so-far-up")).toHaveCount(0);

  // 1つ届けてから開くと、届けたが1つ転がる
  const posted = await page.request.post("/api/publish", { data: { text: `帯を確かめる投稿 ${test.info().testId}`, channelId: "study" } });
  expect(posted.ok()).toBe(true);
  await page.goto("/me");
  await expect(page.locator(".me-so-far[data-rolling]")).toHaveCount(1);
  await expect(band.locator(".so-far-up")).toHaveText("▲+1");
  await expect(band.locator(".so-far-item", { has: page.locator(".so-far-up") })).toContainText("届けた");
  // 転がり終わると、ただの数に戻る
  await expect(page.locator(".me-so-far[data-rolling]")).toHaveCount(0, { timeout: 5000 });
});
