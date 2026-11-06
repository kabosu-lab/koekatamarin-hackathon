import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

const TEACHER = "佐伯 みどり（国語・2年担任）";
const OTHER = "野田 翔（情報・ものづくり部顧問）";

/** このテスト専用のお願いを、別の人から佐伯先生へ送る。 */
async function askTeacher(page: Page, words: string) {
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  const response = await page.request.post("/api/publish", {
    data: { text: words, channelId: "study", askedPersonId: "saeki" },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/");
  await switchPerson(page, TEACHER);
}

test("お願いに話して返すと、本人の話した言葉で届いてゴールになる", async ({ page }) => {
  const words = `相談 ${test.info().testId}`;
  await askTeacher(page, words);

  await page.goto("/inbox");
  const card = page.getByRole("region").filter({ hasText: words });
  await card.getByLabel("話したこと").fill("わからん");
  await card.getByRole("button", { name: "文章にする" }).click();
  await expect(card.locator(".question")).toContainText("あなたのとき");
  await expect(card.getByLabel("返信の文章")).toHaveCount(0);

  const answer = `私は声に出して読んでます ${test.info().testId}`;
  await card.getByLabel("話したこと").fill(answer);
  await card.getByRole("button", { name: "文章にする" }).click();
  await expect(card.getByLabel("返信の文章")).toHaveValue(answer);
  await card.getByRole("button", { name: "本人として返信する" }).click();
  await expect(page.getByText("解決！")).toBeVisible();

  await page.goto("/teams?channel=study");
  const post = page.getByRole("article").filter({ hasText: words });
  await expect(post.locator(".reply")).toContainText(answer);
  await expect(post.locator(".asked")).toContainText("解決");
});

test("詳しくないことはパスでき、相手の受信箱に届く", async ({ page }) => {
  const words = `パスする相談 ${test.info().testId}`;
  await askTeacher(page, words);

  await page.goto("/inbox");
  const card = page.getByRole("region").filter({ hasText: words });
  await card.getByText("もっと詳しい人につなぐ").click();
  await card.getByLabel("つなぐ相手").selectOption({ label: OTHER });
  // パートナーが「@〇〇さん、…どうですか？」の下書きを作り、本人が確かめて送る（0-2g）
  const words2 = card.getByLabel("元の投稿への返事（相手に @ で届きます）");
  await expect(words2).toHaveValue(/^@野田 翔さん、.*どうですか？$/);
  await card.getByRole("button", { name: "つなぐ" }).click();
  await expect(page.getByText("つないでくれてありがとう")).toBeVisible();

  await page.goto("/teams?channel=study");
  await expect(page.getByRole("article").filter({ hasText: words }).locator(".reply")).toContainText("@野田 翔さん");

  await page.goto("/");
  await switchPerson(page, OTHER);
  await page.goto("/inbox");
  await expect(page.getByRole("region").filter({ hasText: words }).locator(".passed")).toContainText("佐伯 みどりさんからのパス");
});

test("声で話して返せる", async ({ page }) => {
  const words = `声で返す相談 ${test.info().testId}`;
  await page.addInitScript((text) => {
    class FakeRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      start() {}
      stop() {
        const result = Object.assign([{ transcript: text }], { isFinal: true });
        this.onresult?.({ resultIndex: 0, results: [result] });
        this.onend?.();
      }
    }
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: FakeRecognition });
  }, "声で話した返事");
  await askTeacher(page, words);

  await page.goto("/inbox");
  const card = page.getByRole("region").filter({ hasText: words });
  await card.getByRole("button", { name: "話して返す" }).click();
  await card.getByRole("button", { name: "話し終わった" }).click();
  await expect(card.getByLabel("話したこと")).toHaveValue("声で話した返事");
});

test("みんなの画面の上に受信箱への入口がある", async ({ page }) => {
  await page.goto("/");
  await page.goto("/minna");
  await expect(page.getByRole("link", { name: /受信箱/ }).first()).toBeVisible();
});

test("届いた日報と日記は受信箱の中の段にまとまり、投稿の流れには混ざらない。前の入口は受信箱へ送る", async ({ page }) => {
  const words = `小テストの見直しをした ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.getByLabel("パートナーに書く").fill(words);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.goto("/daily");
  await page.getByRole("checkbox", { name: words }).click();
  await expect(page.getByRole("checkbox", { name: words })).toBeChecked();

  await page.goto("/");
  await switchPerson(page, TEACHER);
  await page.goto("/daily/received");
  await expect(page).toHaveURL(/\/inbox/);
  const received = page.getByRole("region", { name: "届いた日報と日記" });
  await expect(received.getByRole("heading", { name: /届いた日報と日記（\d+）/ })).toBeVisible();
  const report = received.getByRole("article", { name: "青木 ひよりさんから" });
  await expect(report).toContainText(words);
  await expect(page.locator(".inbox-list")).not.toContainText(words);
  await report.getByLabel("一言かえす").fill("よく見直しましたね");
  await report.getByRole("button", { name: "一言を送る" }).click();
  await expect(report.locator(".response-card")).toContainText("よく見直しましたね");
});

// 0-2q(5)：受信箱に「解決・つないだ」の数は出さず（「これまで」の帯にある）、届いた返事の名前を折らない。広い画面でも1列
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1180, height: 820 },
]) {
  test(`受信箱は数の行を出さず、返事の名前を折らない（${viewport.width}×${viewport.height}）`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await switchPerson(page, "青木 ひより（2年）");
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "受信箱", level: 1 })).toBeVisible();
    await expect(page.getByText(/解決 \d+・つないだ \d+/)).toHaveCount(0);
    for (const name of await page.locator(".inbox-replies a > strong").all()) {
      const lineHeight = await name.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight) || 24);
      expect((await name.boundingBox())!.height).toBeLessThan(lineHeight * 1.6);
    }
    // 中身は1列
    await expect(page.locator("main.page-shell")).toHaveCSS("flex-direction", "column");
  });
}
