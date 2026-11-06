import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

async function say(page: Page, text: string) {
  if (!(await page.getByLabel("パートナーに書く").isVisible())) {
  }
  await page.getByLabel("パートナーに書く").fill(text);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await expect(page.getByRole("button", { name: "とどける" })).toBeEnabled();
}

test("話したことが下書きになり、Teams の見え方を確かめて、本人が送ると届く", async ({ page }) => {
  const words = `今日の授業で作文を褒められました ${test.info().testId}`;
  await page.goto("/");
  await say(page, words);

  await page.getByRole("button", { name: "とどける" }).click();
  await expect(page.getByLabel("投稿の文章")).toHaveValue(words);
  const preview = page.locator(".preview");
  await expect(preview).toContainText("Teams にはこう見えます");
  await expect(preview).toContainText("佐伯 みどり");
  await expect(preview).toContainText(words);
  await expect(page.locator(".perception")).toContainText("大丈夫そう");

  await page.getByRole("button", { name: "本人として送る" }).click();
  await page.getByRole("link", { name: "校内チャネルで見る" }).click();

  const post = page.getByRole("article").filter({ hasText: words });
  await expect(post).toContainText("佐伯 みどり");
  await expect(post.locator(".ai-mark")).toHaveCount(0);
});

test("送るまでは Teams に届かず、取り消すと会話に戻る", async ({ page }) => {
  const words = `取り消す投稿 ${test.info().testId}`;
  await page.goto("/");
  await say(page, words);

  await page.getByRole("button", { name: "とどける" }).click();
  await page.getByRole("button", { name: "取り消す" }).click();

  await expect(page.getByRole("log").locator(".bubble.user")).toContainText(words);
  await page.goto("/teams?channel=study");
  await expect(page.getByText(words)).toHaveCount(0);
});

test("きつい言葉は「こう受け取られるかも」と伝え、言い換えを選べる", async ({ page }) => {
  await page.goto("/");
  await say(page, "隣のクラスの先生は使えない");
  await page.getByRole("button", { name: "とどける" }).click();

  await expect(page.locator(".perception")).toContainText("受け取られるかも");
  // 消さずに、本人の文章を残す
  await expect(page.getByLabel("投稿の文章")).toHaveValue("隣のクラスの先生は使えない");

  await page.getByRole("button", { name: /この言い方にする/ }).click();
  await expect(page.getByLabel("投稿の文章")).toHaveValue(/一緒に考えてもらえると助かります/);
  await expect(page.locator(".perception")).toContainText("大丈夫そう");
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeEnabled();
});

test("文章を書き直したら、確かめ直すまで送れない", async ({ page }) => {
  await page.goto("/");
  await say(page, "今日は頑張った");
  await page.getByRole("button", { name: "とどける" }).click();

  await page.getByLabel("投稿の文章").fill("今日はとても頑張った");
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeDisabled();

  await page.getByRole("button", { name: "受け取られ方を確かめる" }).click();
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeEnabled();
});

test("明らかな個人攻撃は送れず、画面を通さなくても止まる", async ({ page, request }) => {
  await page.goto("/");
  await say(page, "田中は死ね");
  await page.getByRole("button", { name: "とどける" }).click();

  await expect(page.locator(".perception.block")).toBeVisible();
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeDisabled();

  const response = await request.post("/api/publish", {
    data: { text: "田中は死ね", channelId: "study" },
  });
  expect(response.status()).toBe(422);
  await page.goto("/teams?channel=study");
  await expect(page.getByText("田中は死ね")).toHaveCount(0);
});

test("AI と調べたことには印が付き、Teams でも見える", async ({ page }) => {
  const words = `AI と調べたら単語帳が効くそうです ${test.info().testId}`;
  await page.goto("/");
  await say(page, words);
  await page.getByRole("button", { name: "とどける" }).click();
  await expect(page.locator(".preview")).toContainText("AI と調べました");

  await page.getByRole("button", { name: "本人として送る" }).click();
  await page.getByRole("link", { name: "校内チャネルで見る" }).click();
  await expect(page.getByRole("article").filter({ hasText: words }).locator(".ai-mark")).toHaveText("AI と調べました");
});

test("生徒の送り先に職員室は出ない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await say(page, "過去問を解いた");
  await page.getByRole("button", { name: "とどける" }).click();
  const channels = page.getByRole("radiogroup", { name: "送り先のチャネル" });
  await expect(channels.getByRole("radio").first()).toBeVisible();
  await expect(channels.getByRole("radio", { name: /職員室/ })).toHaveCount(0);
});

test("送り先と見える範囲は札で選べ、矢印キーでも動かせる", async ({ page }) => {
  await page.goto("/");
  await say(page, "札で送り先を選ぶ");
  await page.getByRole("button", { name: "とどける" }).click();

  const channels = page.getByRole("radiogroup", { name: "送り先のチャネル" });
  const radios = channels.getByRole("radio");
  expect(await radios.count()).toBeGreaterThan(1);
  await expect(channels.locator("[aria-checked=true]")).toHaveCount(1);
  const second = radios.nth(1);
  await second.click();
  await expect(second).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".preview-title")).toContainText((await second.textContent()) ?? "");

  const scope = page.getByRole("radiogroup", { name: "見える範囲" });
  await expect(scope.getByRole("radio", { name: "チャネルのみんな" })).toHaveAttribute("aria-checked", "true");
  await scope.getByRole("radio", { name: "チャネルのみんな" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(scope.getByRole("radio", { name: "特定の人だけ" })).toHaveAttribute("aria-checked", "true");
  await expect(scope.getByRole("radio", { name: "特定の人だけ" })).toBeFocused();
});

for (const size of [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad 縦", width: 820, height: 1180 },
  { name: "iPad 横", width: 1180, height: 820 },
]) {
  test(`${size.name}の幅でも、長い下書きの本文は途中で切れず、送るボタンは見えている`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");
    await say(page, "長い話をしたい");
    await page.getByRole("button", { name: "とどける" }).click();

    const body = page.getByLabel("投稿の文章");
    const long = Array.from({ length: 14 }, (_, i) => `${i + 1}行目：今日の部活で気づいたことを、少し長めに書いておきます。`).join("\n");
    await body.fill(long);
    // 欄の中でスクロールしないと読めない、ということがない
    await expect
      .poll(() => body.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeLessThanOrEqual(1);
    const lineHeight = await body.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect((await body.boundingBox())!.height).toBeGreaterThan(lineHeight * 14);

    // ボタン列は画面の下に見えたまま
    const sendButton = page.getByRole("button", { name: "本人として送る" });
    await expect(sendButton).toBeInViewport();
    await expect(page.getByRole("button", { name: "取り消す" })).toBeInViewport();
  });
}

test("まだ中身がない会話は、下書きにせず聞き返す", async ({ page }) => {
  await page.goto("/");
  await say(page, "こんにちは");
  await page.getByRole("button", { name: "とどける" }).click();
  await expect(page.locator(".notice")).toContainText("もう少し聞かせて");
});

test("人物を切り替えると、前の人の会話は残らない", async ({ page }) => {
  await page.goto("/");
  await say(page, "誰にも言っていない悩み");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  await expect(page.getByText("誰にも言っていない悩み")).toHaveCount(0);
});

test("下書きを作れないときも、話した言葉は残る", async ({ page }) => {
  await page.route("**/api/draft", (route) => route.fulfill({ status: 503, json: { error: "x" } }));
  await page.goto("/");
  await say(page, "大事な話");
  await page.getByRole("button", { name: "とどける" }).click();
  await expect(page.locator(".notice")).toContainText("もう一度押して");
  await expect(page.getByRole("log").locator(".bubble.user")).toContainText("大事な話");
});
