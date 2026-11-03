import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

const AOKI = "青木 ひより（2年）";
const NODA = "野田 翔（情報・ものづくり部顧問）";
const FUJIMOTO = "藤本 恵（教頭）";

async function become(page: Page, person: string) {
  await page.goto("/");
  await switchPerson(page, person);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
}

test("残す、確認する、広がる、レビューする、直す、探す", async ({ page }) => {
  // 残す：関わった本人が、校内チャネルのやり取りから下書きを作る
  await become(page, AOKI);
  await page.goto("/teams?channel=study");
  await page.locator("#post-post-study-1").getByRole("link", { name: "知恵に残す" }).click();
  await page.getByRole("button", { name: "相棒に下書きを作ってもらう" }).click();
  await page.getByLabel("題").fill("過去問の進め方を残す");
  await page.getByLabel("本文").fill("過去問はネットワークが最後まで苦手でも、半分合うなら順調（野田先生）。");
  await page.getByRole("button", { name: "本人たちに確認してもらう" }).click();
  await expect(page.getByRole("heading", { name: "過去問の進め方を残す" })).toBeVisible();
  await expect(page.getByText("まだ確認中で")).toBeVisible();
  const url = page.url();

  // 確認中は、関わっていない人には見えない
  await become(page, FUJIMOTO);
  await page.goto("/chie");
  await expect(page.getByRole("link", { name: "過去問の進め方を残す" })).toHaveCount(0);
  const hidden = await page.goto(url);
  expect(hidden?.status()).toBe(404);

  // 確認する：受信箱に確認のお願いが届き、本人が認めると広がる
  await become(page, NODA);
  await page.goto("/inbox");
  await page.getByRole("region", { name: "知恵の確認" }).getByRole("link", { name: "過去問の進め方を残す" }).click();
  await page.getByRole("button", { name: "これでいいよ" }).click();
  await expect(page.getByText("まだ確認中で")).toHaveCount(0);
  // 自分の言葉が入った知恵は評価できない
  await expect(page.getByRole("region", { name: "レビューする" })).toHaveCount(0);

  // レビューする：関わっていない人が、言葉を添えて指摘する
  await become(page, FUJIMOTO);
  await page.goto("/chie");
  await page.getByRole("link", { name: "過去問の進め方を残す" }).click();
  await expect(page.getByRole("button", { name: "直したほうがいい" })).toBeDisabled();
  await page.getByLabel("一言").fill("分野の順番も書くと分かりやすそう");
  await page.getByRole("button", { name: "直したほうがいい" }).click();
  await expect(page.getByText("直したほうがいい指摘が1件")).toBeVisible();
  await noOverflow(page);

  // 直す：作った人が直して、指摘を解決にする
  await become(page, AOKI);
  await page.goto(url);
  await page.getByRole("textbox", { name: "本文" }).fill("過去問はネットワークが最後まで苦手でも、半分合うなら順調（野田先生）！");
  await page.getByRole("button", { name: "直して保存する" }).click();
  await page.getByRole("button", { name: "直したので解決にする" }).click();
  await expect(page.getByText("解決しました")).toBeVisible();
  await expect(page.getByText("直したほうがいい指摘が1件")).toHaveCount(0);

  // 探す：本文は実物で、誰の言葉かと元の投稿が付く
  await become(page, FUJIMOTO);
  await page.goto("/chie");
  await page.getByLabel("やりたいこと、困っていること").fill("過去問をどう進めるか");
  await page.getByRole("button", { name: "校内の知恵を探す" }).click();
  const result = page.locator(".chie-results li").first();
  await expect(result).toContainText("過去問");
  await expect(result).toContainText("の言葉");
  await expect(result.getByRole("link", { name: "元の投稿を見る" })).toBeVisible();
  await noOverflow(page);

  // 聞いてみる？：既存のお願いの流れにつながる
  await result.getByRole("link", { name: /聞いてみる/ }).first().click();
  await expect(page.locator(".sent")).toContainText("聞いてみましょう");
});

test("名前と言葉を外すと、作った人が直すまで広がらない", async ({ page }) => {
  await become(page, "木下 蓮（3年・ものづくり部）");
  await page.goto("/chie");
  await page.getByRole("link", { name: "文化祭の動画を早く作る" }).click();
  await expect(page).toHaveURL(/knowledge-festival-video/);
  const url = page.url();
  await expect(page.getByRole("region", { name: "レビューする" })).toHaveCount(0);
  await page.getByRole("button", { name: "名前と言葉を外す" }).click();
  await expect(page.getByText("まだ確認中で")).toBeVisible();

  await become(page, AOKI);
  await page.goto("/chie");
  await expect(page.getByRole("link", { name: "文化祭の動画を早く作る" })).toHaveCount(0);

  await become(page, "川村 陽菜（理科・1年副担任）");
  await page.goto(url);
  await expect(page.getByText("外してほしいという人がいます")).toBeVisible();
  await page.getByRole("textbox", { name: "本文" }).fill("撮る前に、30秒の場面を紙に6枚書くと撮り直しが減る（野田先生）。");
  await page.getByRole("button", { name: "直して保存する" }).click();
  await expect(page.getByText("外してほしいという人がいます")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("確認に戻しました");
});

test("話す画面では、話したあとに押したときだけ探す", async ({ page }) => {
  let calls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/chie/find")) calls += 1;
  });
  await become(page, FUJIMOTO);
  await expect(page.getByRole("button", { name: "校内の知恵を探す" })).toHaveCount(0);
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill("小テストを作りたい");
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByRole("button", { name: "校内の知恵を探す" })).toBeEnabled();
  expect(calls).toBe(0);

  await page.getByRole("button", { name: "校内の知恵を探す" }).click();
  const card = page.getByRole("region", { name: "校内の知恵" });
  await expect(card).toContainText("小テストを10分で作る");
  expect(calls).toBe(1);

  await card.getByRole("button", { name: /大河原 誠さんに聞いてみる/ }).click();
  await expect(page.locator(".sent")).toContainText("大河原 誠さんに聞いてみましょう");
  await page.getByRole("button", { name: "言葉にして送る" }).click();
  await expect(page.getByRole("region", { name: "言葉にして送る" })).toContainText("大河原 誠");
  await noOverflow(page);
});
