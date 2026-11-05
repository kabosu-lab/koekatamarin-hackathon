import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

// SPEC の「デモ（3分）」を最初から最後まで動かす。写真は Git に入らない test-results/ に残す。
const TEACHER = "佐伯 みどり（国語・2年担任）";
const EXPERT = "野田 翔（情報・ものづくり部顧問）";
const ADMIN = "藤本 恵（教頭）";
const MAKER = "木下 蓮（3年・ものづくり部）";
const STUDENT = "青木 ひより（2年）";

async function shot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

async function say(page: Page, text: string) {
  if (!(await page.getByLabel("相棒に書く").isVisible())) {
  }
  const count = await page.getByRole("log").locator(".bubble.assistant").count();
  await page.getByLabel("相棒に書く").fill(text);
  await page.getByRole("button", { name: "相棒へ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant")).toHaveCount(count + 1);
}

async function replyFromInbox(page: Page, from: RegExp, spoken: string) {
  const card = page.getByRole("region", { name: from });
  await card.getByLabel("話したこと").fill(spoken);
  await card.getByRole("button", { name: "文章にする" }).click();
  await expect(card.getByLabel("返信の文章")).toHaveValue(spoken);
  await card.getByRole("button", { name: "本人として返信する" }).click();
  await expect(page.getByText("返信が届きました。解決！")).toBeVisible();
}

test("先生の一日：話しかける、返す、パス、サンクス、日報、桜", async ({ page }) => {
  test.setTimeout(120_000);

  // 朝：ICT が苦手な先生が、スマホに「私は嫌やわ」と話しかける
  await page.goto("/");
  await switchPerson(page, TEACHER);
  await expect(page.locator(".promise")).toBeVisible();
  await say(page, "私は嫌やわ");
  await expect(page.getByRole("log").locator(".bubble.assistant")).toContainText("無理に使わんでええ");
  await shot(page, "01-話しかける");
  await say(page, "今日は作文の一言のことを相談された");

  // 生徒の頑張りと「お願いします」が、朝の受信箱に届く
  await page.getByRole("link", { name: /受信箱/ }).click();
  await expect(page.getByRole("region", { name: /川村 陽菜さんからのお願い/ })).toBeVisible();
  await expect(page.getByRole("region", { name: /木下 蓮さんからのお願い/ })).toBeVisible();
  await shot(page, "02-受信箱");

  // 話すだけで返す
  await replyFromInbox(page, /川村 陽菜さんからのお願い/, "私はいいところを一つだけ書いています");
  await shot(page, "03-話して返す");

  // 詳しくないことは、別の先生へパス
  const maker = page.getByRole("region", { name: /木下 蓮さんからのお願い/ });
  await maker.getByText("もっと詳しい人につなぐ").click();
  await maker.getByLabel("つなぐ相手").selectOption({ label: EXPERT });
  await maker.getByRole("button", { name: "つなぐ" }).click();
  await expect(page.getByText("つないでくれてありがとう")).toBeVisible();
  await shot(page, "04-パス");

  // パスを受けた先生が返して、ゴール
  await page.goto("/");
  await switchPerson(page, EXPERT);
  await page.goto("/inbox");
  await expect(page.getByRole("region", { name: /木下 蓮さんからのお願い/ }).locator(".passed")).toContainText("佐伯 みどり");
  await replyFromInbox(page, /木下 蓮さんからのお願い/, "底を厚くすると反りにくくなりますよ");

  await page.goto("/teams?channel=making");
  await expect(page.getByRole("article").filter({ hasText: "しおり立ての底を広くしたら" }).locator(".asked")).toContainText(
    "佐伯 みどりさんがつないで → 野田 翔さんへ（解決！）",
  );
  await shot(page, "05-ゴール");

  // 生徒から、サンクスカード
  await page.goto("/");
  await switchPerson(page, MAKER);
  await page.goto("/me");
  const form = page.getByRole("region", { name: "サンクスカードを送る" });
  await form.getByLabel("送る相手").selectOption({ label: TEACHER });
  await form.getByLabel("ありがとうの言葉").fill("つないでくれて、ありがとうございました");
  await form.getByRole("button", { name: "サンクスカードを送る" }).click();
  await expect(form).toContainText("ありがとうが届きました");

  // アシストが付き、ありがとうが届き、相棒が育つ
  await page.goto("/");
  await switchPerson(page, TEACHER);
  await page.goto("/me");
  const quiz = page.getByRole("region", { name: "最初の問いかけ" });
  if (await quiz.isVisible()) {
    await quiz.getByRole("button", { name: "人物" }).click();
    await quiz.getByRole("button", { name: "じっくり話を聞く" }).click();
    await expect(quiz).toHaveCount(0);
  }
  await expect(page.getByRole("region", { name: "これまで" })).toContainText(/解決 [1-9]/);
  await expect(page.getByRole("region", { name: "これまで" })).toContainText(/つないだ [1-9]/);
  await expect(page.getByRole("region", { name: "もらったありがとう" })).toContainText("つないでくれて");
  await shot(page, "06-相棒とありがとう");

  // 夕方：日報が届き、チェックを付けて管理職へ
  await page.getByRole("link", { name: "今日の日報" }).click();
  await page.getByRole("button", { name: "今日の日報を作る" }).click();
  const box = page.getByRole("checkbox", { name: /作文の一言/ });
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(box).toBeChecked();
  await shot(page, "07-日報");

  // 一言が返る
  await page.goto("/");
  await switchPerson(page, ADMIN);
  await page.goto("/daily/received");
  const report = page.getByRole("article", { name: "佐伯 みどりさんから" });
  await expect(report).toContainText("作文の一言");
  await expect(report).not.toContainText("私は嫌やわ");
  await report.getByLabel("一言かえす").fill("いつもありがとうございます");
  await report.getByRole("button", { name: "一言を送る" }).click();
  await expect(report.locator(".response-card")).toContainText("いつもありがとうございます");
  await shot(page, "08-管理職の一言");

  await page.goto("/");
  await switchPerson(page, TEACHER);
  await page.goto("/daily");
  await expect(page.getByRole("region", { name: "届いた一言" })).toContainText("藤本 恵先生");

  // 生徒の日記は担任に届く
  await page.goto("/");
  await switchPerson(page, STUDENT);
  await say(page, "過去問が半分解けた");
  await page.goto("/daily");
  await page.getByRole("button", { name: "今日の日記を作る" }).click();
  const diary = page.getByRole("checkbox", { name: /過去問が半分解けた/ });
  await diary.click();
  await expect(diary).toBeChecked();

  await page.goto("/");
  await switchPerson(page, TEACHER);
  await page.goto("/daily/received");
  await expect(page.getByRole("article", { name: "青木 ひよりさんから" })).toContainText("過去問が半分解けた");
  await shot(page, "09-生徒の日記");

  // やり取りが校内の知恵になり、次に困った人の役に立つ
  await page.goto("/chie");
  await expect(page.getByRole("link", { name: "小テストを10分で作る" })).toBeVisible();
  await shot(page, "09-2-校内の知恵");

  // 締め：校内の桜が咲く
  await page.goto("/minna?season=haru");
  await expect(page.getByRole("region", { name: "校内の桜" })).toContainText("今年の桜が");
  await shot(page, "10-桜");
});
