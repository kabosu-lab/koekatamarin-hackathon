import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

// 0-2b 第4段：ふりかえりとポートフォリオは「ふりかえり」1つ。長い期間は読むだけで、確かめずに送れる道はない

test("ふりかえりの「この一年」は読むだけで、共有の道はなく、チャネルにも出ない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.getByRole("link", { name: "履歴と設定" }).click();
  await page.getByRole("navigation", { name: "履歴と設定の項目" }).getByRole("link", { name: "ふりかえり" }).click();

  const periods = page.getByRole("navigation", { name: "期間を選ぶ" });
  await expect(periods.getByRole("link", { name: "卒業まで" })).toBeVisible();
  await periods.getByRole("link", { name: "この一年" }).click();
  await expect(periods.getByRole("link", { name: "この一年" })).toHaveAttribute("aria-current", "page");

  const year = page.getByRole("region", { name: "この一年のふりかえり" });
  await year.getByRole("button", { name: "パートナーにふりかえりを書いてもらう" }).click();
  const result = page.getByRole("region", { name: "あなたのふりかえり" });
  await expect(result).toContainText("やり取りがありました");

  // 残す・足す・届けるのボタンも、本人として共有するボタンもない
  await expect(page.getByRole("button", { name: /共有する|本人として送る|残す|届ける項目を選ぶ/ })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);

  const body = await result.locator(".lookback-text").innerText();
  await page.goto("/teams?channel=study");
  await expect(page.getByText(body)).toHaveCount(0);
});

test("前の /lookback の画面も読むだけで、共有の道はない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/lookback");
  await page.getByRole("button", { name: "この一年" }).click();
  await expect(page.getByRole("region", { name: "あなたのふりかえり" })).toContainText("やり取りがありました");
  await expect(page.getByRole("button", { name: "本人として共有する" })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
});

test("先生には「卒業まで」が出ない", async ({ page }) => {
  await page.goto("/me?open=lookback");
  const periods = page.getByRole("navigation", { name: "期間を選ぶ" });
  await expect(periods.getByRole("link", { name: "この一年" })).toBeVisible();
  await expect(periods.getByRole("link", { name: "卒業まで" })).toHaveCount(0);
  await page.goto("/lookback");
  await expect(page.getByRole("button", { name: "この一年" })).toBeVisible();
  await expect(page.getByRole("button", { name: "卒業まで" })).toHaveCount(0);
});
