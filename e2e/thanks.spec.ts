import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";
import { openEnvelopes } from "./thanks-book";

// 0-3d：サンクスカードは、ふつうの投稿の1つの種類。入口は話す画面だけ。札で見分け、札を回せばふつうの投稿に戻る

async function say(page: Page, text: string) {
  await page.getByLabel("パートナーに書く").fill(text);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await expect(page.getByRole("button", { name: "とどける" })).toBeEnabled();
}

const sheetOf = (page: Page) => page.getByRole("region", { name: "言葉にして送る" });
const tagOf = (page: Page) => sheetOf(page).getByRole("button", { name: "種類を替える" });

test("ありがとうのタイルには送る欄がなく、話す画面へ案内する", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/me?open=thanks");
  await expect(page.getByRole("region", { name: "もらったありがとう" })).toBeVisible();
  await expect(page.getByRole("region", { name: "サンクスカードを送る" })).toHaveCount(0);
  await expect(page.getByLabel("届けることば")).toHaveCount(0);
  await expect(page.getByLabel("名前で探す")).toHaveCount(0);
  await expect(page.locator(".thanks-howto")).toContainText("ありがとうを伝えたい");
});

test("話すとカードの下書きになり、送ると封筒で届き、受信箱のお願いには並ばない", async ({ page }) => {
  const id = test.info().testId.slice(0, 8);
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/");
  await say(page, `野田先生に、資料${id}ありがとうって伝えたい`);
  await page.getByRole("button", { name: "とどける" }).click();

  const sheet = sheetOf(page);
  await expect(tagOf(page)).toHaveText("【ありがとう】");
  await expect(sheet).toHaveAttribute("data-card", "thanks");
  await expect(sheet.locator(".preview-asked")).toHaveText("野田 翔さんへ");
  await expect(sheet.getByLabel("投稿の文章")).toHaveValue(new RegExp(`資料${id}ありがとう`));
  await expect(page.locator(".perception")).toContainText("大丈夫そう");

  const published = page.waitForRequest((request) => request.url().endsWith("/api/publish"));
  await sheet.getByRole("button", { name: "本人として送る" }).click();
  const body = (await published).postDataJSON() as Record<string, unknown>;
  expect(body).toMatchObject({ channelId: "thanks", askedPersonId: "noda", subject: "【ありがとう】野田 翔さんへ" });
  // 送ると花びらが舞う
  await expect(page.locator(".card-petals i").first()).toBeAttached();

  // 話す画面で、封筒の知らせが出る（0-3a）
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await page.goto("/");
  await expect(page.locator(".partner-bubble")).toHaveText("ありがとうが届いています", { timeout: 15_000 });
  // カードはお願いではないので、受信箱に「未回答」で残らない。もらったありがとうに入る
  await page.goto("/inbox");
  await expect(page.locator(".inbox-item").filter({ hasText: `資料${id}` })).toHaveCount(0);
  await page.goto("/me?open=thanks");
  await expect(page.getByRole("region", { name: "もらったありがとう" })).toContainText("青木 ひよりさんから");
  // みんなの画面では、カードの縁と花びらの印
  await page.context().addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/minna");
  const post = page.getByRole("article").filter({ hasText: `資料${id}` });
  await expect(post).toHaveAttribute("data-card", "thanks");
  await expect(post.locator(".card-mark")).toBeVisible();
});

test("札を回すとカードからふつうの投稿に戻り、宛名とありがとうのチャネルが外れる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/");
  await say(page, `佐伯先生に、県大会おめでとうって言いたい`);
  await page.getByRole("button", { name: "とどける" }).click();

  const sheet = sheetOf(page);
  await expect(tagOf(page)).toHaveText("【おめでとう】");
  await expect(sheet).toHaveAttribute("data-card", "congrats");
  await tagOf(page).click();
  await expect(tagOf(page)).toHaveText("【うまくいった】");
  await expect(sheet).not.toHaveAttribute("data-card", /.+/);
  await expect(sheet.locator(".preview-asked")).toHaveCount(0);
  // ふつうの投稿に戻ったので、見える範囲も選べる
  await expect(sheet.getByRole("radiogroup", { name: "見える範囲" })).toBeVisible();

  await expect(page.locator(".perception")).toContainText("大丈夫そう");
  const published = page.waitForRequest((request) => request.url().endsWith("/api/publish"));
  await sheet.getByRole("button", { name: "本人として送る" }).click();
  const body = (await published).postDataJSON() as Record<string, unknown>;
  expect(body.askedPersonId).toBeUndefined();
  expect(body.channelId).not.toBe("thanks");
  expect(String(body.subject)).toMatch(/^【うまくいった】/);
});

test("みんなの「おめでとう」のボタンからは、【おめでとう】の札で下書きが始まる", async ({ page, context }) => {
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
  // 頑張りの投稿を1つ、木下さん宛てに用意する（おすすめの上の段に入るので、ほかのテストの投稿が多くても見える）
  await page.goto("/");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  const posted = await page.request.post("/api/publish", {
    data: { text: `合奏の練習、最後まで通せた ${test.info().testId}`, channelId: "clubs", kind: "effort", askedPersonId: "kinoshita" },
  });
  expect(posted.ok()).toBe(true);
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await page.goto("/minna");
  const entry = page.getByRole("link", { name: /さんにおめでとうを送る$/ }).first();
  const to = ((await entry.getAttribute("aria-label")) ?? "").replace(/さんにおめでとうを送る$/, "");
  expect(await entry.getAttribute("href")).toContain("kind=congrats");
  await entry.click();
  await expect(tagOf(page)).toHaveText("【おめでとう】");
  await expect(sheetOf(page).locator(".preview-asked")).toHaveText(`${to}さんへ`);
});

test("前の話が残っていても、ありがとうのボタンから来たら決め文句の行が会話に入る", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/");
  await say(page, "今日は過去問を解いた");
  await page.goto("/?thanks=noda");
  await expect(sheetOf(page)).toHaveAttribute("data-card", "thanks");
  const log = page.getByRole("log");
  await expect(log.locator(".bubble.user").filter({ hasText: "今日は過去問を解いた" })).toHaveCount(1);
  await expect(log.locator(".bubble.user").filter({ hasText: "野田 翔さんにありがとうを伝えたい" })).toHaveCount(1);
  // パートナーも一言返し、その左にアイコンが出る（シートを閉じても、何をしているか分かる）
  const reply = log.locator(".chat-row.partner").filter({ hasText: "野田 翔さんへのカードの下書きを作るね" });
  await expect(reply).toHaveCount(1);
  await expect(reply.locator(".chat-icon .chat-icon-art")).toBeVisible();
});

test("受信箱の届いた返事の「ありがとう」は、話す画面でその人へのカードの下書きを開く", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/inbox");
  const replies = page.getByRole("region", { name: "届いた返事" });
  await replies.getByRole("link", { name: "野田 翔さんにありがとうを送る" }).first().click();
  await expect(page).toHaveURL(/\/$/);
  const sheet = sheetOf(page);
  await expect(sheet).toHaveAttribute("data-card", "thanks");
  await expect(sheet.locator(".preview-asked")).toHaveText("野田 翔さんへ");
  await expect(tagOf(page)).toHaveText("【ありがとう】");
});
