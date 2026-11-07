import { DatabaseSync } from "node:sqlite";
import { expect, type Page, test } from "@playwright/test";

/** 試用のサーバーが残した、話の中の感想（playwright.config.ts が KOEKATA_E2E_TRIAL_DB に道を置く） */
function talkFeedback(body: string): Record<string, unknown>[] {
  const db = new DatabaseSync(process.env.KOEKATA_E2E_TRIAL_DB!, { readOnly: true });
  try {
    return db.prepare("SELECT kind, body, path, screen_width FROM trial_feedback WHERE body = ?").all(body) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}

// 試用中の感想（0-2h）。このファイルは「スマホ」の project で動くので、試用のサーバー（次の番号）へは住所を替えて向ける
const PORT = Number(process.env.KOEKATA_E2E_PORT ?? 3100);
const TRIAL = `http://127.0.0.1:${PORT + 1}`;
const CODE = "test-code";
/** 端末の枠は上と左右に少ししか余白がないので、アイコンは右上の角にまたがる。窓に入り込んでよいのは、横・縦ともこの px まで（Pixel 7 の幅で実測 横 32・縦 34。枠の黒い縁 約 8px を含む） */

test("本番（合言葉なし）では、感想の入口も受け取りもない", async ({ page }) => {
  for (const path of ["/", "/minna", "/me"]) {
    await page.goto(path);
    await expect(page.locator(".talk, main").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "感想を送る" }), path).toHaveCount(0);
  }
  expect((await page.request.post("/api/feedback", { data: { body: "本番" } })).status()).toBe(404);
});

test.describe("試用版", () => {
  test.use({ baseURL: TRIAL });

  async function enter(page: Page) {
    await page.goto("/access");
    await page.getByLabel("合言葉").fill(CODE);
    await page.getByRole("button", { name: "入る" }).click();
    await expect(page.locator(".talk")).toBeVisible();
    await page.getByRole("dialog", { name: "試用版について" }).getByRole("button", { name: "わかった" }).click();
  }

  test("どの画面でも右上に小さく浮かび、窓をずらさない。埋め込みには出さない", async ({ page }) => {
    await enter(page);
    const fab = page.getByRole("button", { name: "感想を送る" });
    for (const path of ["/", "/minna", "/me", "/inbox"]) {
      await page.goto(path);
      await expect(fab, path).toBeInViewport({ ratio: 1 });
      const box = (await fab.boundingBox())!;
      const viewport = page.viewportSize()!;
      // 右上のすみ
      expect(box.x + box.width, path).toBeGreaterThan(viewport.width - 60);
      expect(box.y, path).toBeLessThan(60);
      // 0-2r：アイコンのために窓をずらさない。アイコンを消しても、本体の位置は同じ
      const body = page.locator(".retro-home:visible, .page-shell:visible, .minna-frame:visible").first();
      const before = (await body.boundingBox())!;
      await fab.evaluate((element) => ((element as HTMLElement).style.display = "none"));
      const after = (await body.boundingBox())!;
      expect(after.y, path).toBe(before.y);
      expect(after.height, path).toBe(before.height);
    }
    // 広い画面の横に並ぶ画面（埋め込み）には出さない
    await page.evaluate(() => (document.documentElement.dataset.embed = "true"));
    await expect(fab).toBeHidden();
  });

  test("種類を選ばず、打った言葉だけで送れる", async ({ page }) => {
    await enter(page);
    await page.goto("/minna");
    await page.getByRole("button", { name: "感想を送る" }).click();
    const sheet = page.getByRole("dialog", { name: "感想を送る" });
    const send = sheet.getByRole("button", { name: "送る", exact: true });
    await expect(send).toBeDisabled();
    await sheet.getByLabel("くわしく").fill("みんなの画面の文字がもう少し大きいとうれしい");
    const request = page.waitForRequest((r) => r.url().endsWith("/api/feedback") && r.method() === "POST");
    await send.click();
    const body = (await request).postDataJSON() as Record<string, unknown>;
    expect(body.kind).toBeUndefined();
    expect(body.body).toBe("みんなの画面の文字がもう少し大きいとうれしい");
    expect(body.path).toBe("/minna");
    // 名前や人物は送らない
    expect(Object.keys(body).sort()).toEqual(["body", "path", "screenWidth"]);
    await expect(sheet).toBeHidden();
    await expect(page.locator(".feedback-thanks")).toHaveText("ありがとう");
  });

  test("押し続けて話すと、聞いた言葉が欄に入り、そのまま送れる", async ({ page }) => {
    await page.addInitScript(() => {
      class FakeRecognition {
        onresult: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        start() {}
        stop() {
          this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: "ホイールの使い方が分かりにくい" }], { isFinal: true })] });
          this.onend?.();
        }
      }
      Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: FakeRecognition });
    });
    await enter(page);
    await page.getByRole("button", { name: "感想を送る" }).click();
    const sheet = page.getByRole("dialog", { name: "感想を送る" });
    const mic = sheet.getByRole("button", { name: "押しながら話す" });
    await mic.hover();
    await page.mouse.down();
    await expect(sheet.getByRole("button", { name: "離すと文字になる" })).toBeVisible();
    await page.mouse.up();
    await expect(sheet.getByLabel("くわしく")).toHaveValue("ホイールの使い方が分かりにくい");
    await sheet.getByRole("button", { name: "送る", exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.locator(".feedback-thanks")).toHaveText("ありがとう");
  });

  test("話す画面でアプリへの感想が出ると、パートナーが届けてよいか聞き、届けてくださいと言うとその場で1件残り、届けたと言い切る", async ({ page }) => {
    await enter(page);
    // 走らせるたびに違う言葉にする（同じ言葉は二重に残さないため）
    const said = `このアプリ、ボタンが分かりにくい ${test.info().testId}-${Date.now()}`;
    const write = page.getByLabel("パートナーに書く");
    const sendTalk = page.getByRole("button", { name: "パートナーへ送る" });
    const replies = page.locator(".bubble.assistant");
    await write.fill(said);
    await sendTalk.click();
    await expect(replies.last()).toContainText("作っている人に届けてもいい？");
    await expect(replies.last()).not.toContainText("[[");
    expect(talkFeedback(said)).toHaveLength(0);

    await write.fill("届けてください");
    await sendTalk.click();
    await expect(replies.last()).toContainText("届けたよ、ありがとう");
    await expect(replies.last()).not.toContainText("[[");
    await expect(replies.last()).not.toContainText(/画面から|自分では|送れない/);
    await expect(page.locator(".feedback-thanks")).toHaveText("ありがとう");
    // サーバーが trial_feedback に本人の言葉と画面の場所だけを残す（名前や人物の列はない）
    await expect.poll(() => talkFeedback(said)).toHaveLength(1);
    expect(talkFeedback(said)[0]).toMatchObject({ kind: "話の中で", body: said, path: "/" });
    expect(Number(talkFeedback(said)[0].screen_width)).toBeGreaterThan(0);

    // 続けて同意の言葉を言っても、二重に残さない
    await write.fill("いいよ");
    await sendTalk.click();
    await expect(replies).toHaveCount(3);
    expect(talkFeedback(said)).toHaveLength(1);
  });

  test("届けてよいか聞かれて断ったら、何も残さない。聞かれていないときのいいよも残さない", async ({ page }) => {
    await enter(page);
    const said = `このアプリ、文字が小さくて分かりにくい ${test.info().testId}-${Date.now()}`;
    const write = page.getByLabel("パートナーに書く");
    const sendTalk = page.getByRole("button", { name: "パートナーへ送る" });
    const replies = page.locator(".bubble.assistant");

    await write.fill(said);
    await sendTalk.click();
    await expect(replies.last()).toContainText("作っている人に届けてもいい？");
    await write.fill("いや、やめとく");
    await sendTalk.click();
    await expect(replies).toHaveCount(2);
    await expect(replies.last()).not.toContainText("届けたよ");
    await write.fill("いいよ");
    await sendTalk.click();
    await expect(replies).toHaveCount(3);
    await expect(replies.last()).not.toContainText("届けたよ");
    expect(talkFeedback(said)).toHaveLength(0);
    await expect(page.locator(".feedback-thanks")).toHaveCount(0);
  });
});
