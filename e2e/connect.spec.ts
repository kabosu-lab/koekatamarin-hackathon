import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

async function say(page: Page, text: string) {
  if (!(await page.getByLabel("相棒に書く").isVisible())) {
  }
  const count = await page.getByRole("log").locator(".bubble.assistant").count();
  await page.getByLabel("相棒に書く").fill(text);
  await page.getByRole("button", { name: "相棒へ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant")).toHaveCount(count + 1);
}

const card = (page: Page) => page.getByRole("region", { name: "人につなぐ提案" });

test("話の途中では声をかけず、煮詰まったときに人を紹介して、聞いてみると相手の名前付きで届く", async ({ page }) => {
  const words = `テスト ${test.info().testId}`;
  await page.goto("/");
  await say(page, "授業のことで悩んでいて");
  await expect(card(page)).toHaveCount(0);
  await say(page, words);
  await page.waitForTimeout(300);
  await expect(card(page)).toHaveCount(0);

  await say(page, "もう煮詰まってきた");
  await expect(card(page)).toContainText("聞いてみる？");

  await card(page).getByRole("button", { name: "聞いてみる" }).click();
  const preview = page.locator(".preview");
  await expect(preview.locator(".preview-asked")).toContainText("さんへ");
  const askedText = await preview.locator(".preview-asked").innerText();

  await page.getByRole("button", { name: "本人として送る" }).click();
  await page.getByRole("link", { name: "校内チャネルで見る" }).click();
  const post = page.getByRole("article").filter({ hasText: words });
  await expect(post.locator(".asked")).toHaveText(askedText);
});

test("「今はいい」と言えば消え、同じ会話では二度と声をかけない", async ({ page }) => {
  await page.goto("/");
  await say(page, "悩んでいて");
  await say(page, "もう煮詰まってきた");
  await card(page).getByRole("button", { name: "今はいい" }).click();
  await expect(card(page)).toHaveCount(0);

  await say(page, "まだ煮詰まってる");
  await page.waitForTimeout(300);
  await expect(card(page)).toHaveCount(0);
});

test("命や安全の案内が出ているときは、人の紹介をしない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  await say(page, "悩んでいて");
  await say(page, "もう煮詰まって死にたい");
  await expect(page.getByRole("region", { name: "相談室に伝えました" })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(card(page)).toHaveCount(0);
});

test("ある人の話は、別の人の画面に出てこない", async ({ page }) => {
  const secret = `誰にも言っていない秘密 ${test.info().testId}`;
  await page.goto("/");
  await say(page, secret);
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await expect(page.getByText(secret)).toHaveCount(0);
  for (const path of ["/teams?channel=study", "/teams?channel=staffroom", "/soudan"]) {
    await page.goto(path);
    await expect(page.getByText(secret)).toHaveCount(0);
  }
});
