import { expect, type Page, test } from "@playwright/test";

// 試用中の感想（0-2h）。このファイルは「スマホ」の project で動くので、試用のサーバー（次の番号）へは住所を替えて向ける
const PORT = Number(process.env.KOEKATA_E2E_PORT ?? 3100);
const TRIAL = `http://127.0.0.1:${PORT + 1}`;
const CODE = "test-code";
/** 端末の枠は上と左右に少ししか余白がないので、アイコンは右上の角にまたがる。窓に入り込んでよいのは、横・縦ともこの px まで（Pixel 7 の幅で実測 横 32・縦 34。枠の黒い縁 約 8px を含む） */
const LCD_BITE = 36;

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

  function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  }

  test("どの画面でも右上に小さく浮かび、ほかの部品にかぶらない。埋め込みには出さない", async ({ page }) => {
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
      // 窓（端末の枠）には、右上の角にまたがるだけ。食い込みは枠の縁を含めて角の小さな範囲
      const frame = page.locator(".lcd:visible").first();
      const lcd = (await frame.count()) > 0 ? await frame.boundingBox() : null;
      if (lcd) {
        const right = lcd.x + lcd.width;
        expect(box.x + box.width, path).toBeGreaterThan(right);
        expect(box.y, path).toBeLessThan(lcd.y);
        expect(right - box.x, path).toBeLessThanOrEqual(LCD_BITE);
        expect(box.y + box.height - lcd.y, path).toBeLessThanOrEqual(LCD_BITE);
      }
      // 押せるものと重ならない（ホイール・下の帯・ほかのボタンや欄）
      const others = await page
        .locator("button:visible, a:visible, input:visible, textarea:visible, .device-controls:visible")
        .evaluateAll((elements) =>
          elements
            .filter((element) => !element.closest(".feedback-fab, .bottom-sheet, .first-card-backdrop"))
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return { name: `${element.tagName}.${element.className}`, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            })
            .filter((rect) => rect.width > 0 && rect.height > 0),
        );
      for (const other of others) expect(overlaps(box, other), `${path} ${other.name}`).toBe(false);
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

  test("話す画面でアプリへの感想が出ると、パートナーが届けてよいか聞き、いいよと言ったら本人の言葉だけを届ける", async ({ page }) => {
    await enter(page);
    const said = "このアプリ、ボタンが分かりにくい";
    const posted: Record<string, unknown>[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/feedback") && r.method() === "POST") posted.push(r.postDataJSON() as Record<string, unknown>);
    });
    const write = page.getByLabel("パートナーに書く");
    const sendTalk = page.getByRole("button", { name: "パートナーへ送る" });
    await write.fill(said);
    await sendTalk.click();
    await expect(page.locator(".bubble.assistant").last()).toContainText("作っている人に届けてもいい？");
    await expect(page.locator(".bubble.assistant").last()).not.toContainText("[[");

    const request = page.waitForRequest((r) => r.url().endsWith("/api/feedback") && r.method() === "POST");
    await write.fill("いいよ");
    await sendTalk.click();
    const body = (await request).postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({ body: said, from: "talk" });
    expect(Object.keys(body).sort()).toEqual(["body", "from", "path", "screenWidth"]);
    await expect(page.locator(".feedback-thanks")).toHaveText("ありがとう");
    await expect(page.locator(".bubble.assistant").last()).toContainText("ありがとう");
    expect(posted).toHaveLength(1);
  });

  test("届けてよいか聞かれて断ったら、何も送らない。聞かれていないときのいいよも送らない", async ({ page }) => {
    await enter(page);
    const posted: string[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/feedback") && r.method() === "POST") posted.push(r.url());
    });
    const write = page.getByLabel("パートナーに書く");
    const sendTalk = page.getByRole("button", { name: "パートナーへ送る" });
    const replies = page.locator(".bubble.assistant");

    await write.fill("このアプリ、文字が小さくて分かりにくい");
    await sendTalk.click();
    await expect(replies.last()).toContainText("作っている人に届けてもいい？");
    await write.fill("いや、やめとく");
    await sendTalk.click();
    await expect(replies).toHaveCount(2);
    await write.fill("いいよ");
    await sendTalk.click();
    await expect(replies).toHaveCount(3);
    expect(posted).toHaveLength(0);
  });
});
