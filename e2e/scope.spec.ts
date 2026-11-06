import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

async function draft(page: Page, words: string) {
  await page.getByLabel("パートナーに書く").fill(words);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "とどける" }).click();
  await expect(page.getByLabel("投稿の文章")).toHaveValue(words);
}

test("「自分だけ」を選ぶと、Teams の見え方でも伝え、他の人には見えない", async ({ page }) => {
  const words = `自分だけの話 ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await draft(page, words);

  await page.getByRole("radiogroup", { name: "見える範囲" }).getByRole("radio", { name: "自分だけ" }).click();
  await expect(page.getByRole("radio", { name: "自分だけ" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".preview-scope")).toHaveText("あなただけに見えます");
  await page.getByRole("button", { name: "本人として送る" }).click();
  await page.getByRole("link", { name: "校内チャネルで見る" }).click();
  await expect(page.getByRole("article").filter({ hasText: words }).locator(".ai-mark")).toHaveText("自分だけ");

  const channel = new URL(page.url()).search;
  await page.goto("/");
  await switchPerson(page, "佐伯 みどり（国語・2年担任）");
  await page.goto(`/teams${channel}`);
  await expect(page.getByText(words)).toHaveCount(0);
});

test("「特定の人だけ」は相手を選ぶまで送れない", async ({ page }) => {
  const words = `特定の人への話 ${test.info().testId}`;
  await page.goto("/");
  await draft(page, words);

  await page.getByLabel("見える範囲").getByRole("radio", { name: "特定の人だけ" }).click();
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeDisabled();
  await page.getByLabel("見せる相手").selectOption({ label: "大河原 誠（英語・学年主任）" });
  await expect(page.locator(".preview-scope")).toContainText("大河原 誠さんとあなただけ");
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeEnabled();
});

test("送った直後なら取り消せて、チャネルから消える", async ({ page }) => {
  const words = `取り消す話 ${test.info().testId}`;
  await page.goto("/");
  await draft(page, words);
  await page.getByRole("button", { name: "本人として送る" }).click();
  await page.getByRole("button", { name: "送ったものを取り消す" }).click();
  await expect(page.locator(".notice")).toContainText("取り消しました");

  await page.goto("/teams?channel=study");
  await expect(page.getByText(words)).toHaveCount(0);
});
