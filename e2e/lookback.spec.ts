import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

test("ふりかえりはまず本人にだけ見え、選べば共有できる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.getByRole("link", { name: "履歴と設定" }).click();
  await page.getByRole("link", { name: "ふりかえり" }).click();

  await expect(page.getByRole("button", { name: "卒業まで" })).toBeVisible();
  await page.getByRole("button", { name: "この一年" }).click();
  const result = page.getByRole("region", { name: "あなたのふりかえり" });
  await expect(result).toContainText("やり取りがありました");

  // 共有しなければ、チャネルに出ない
  const body = await result.locator(".lookback-text").innerText();
  await page.goto("/teams?channel=study");
  await expect(page.getByText(body)).toHaveCount(0);

  await page.goto("/lookback");
  await page.getByRole("button", { name: "この一年" }).click();
  await result.getByLabel(/共有したいとき/).selectOption({ label: "資格の勉強会" });
  await result.getByRole("button", { name: "本人として共有する" }).click();
  await expect(page.getByText("校内チャネルに届きました")).toBeVisible();
});

test("先生には「卒業まで」が出ない", async ({ page }) => {
  await page.goto("/lookback");
  await expect(page.getByRole("button", { name: "この一年" })).toBeVisible();
  await expect(page.getByRole("button", { name: "卒業まで" })).toHaveCount(0);
});
