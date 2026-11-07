import { expect, type Page, test } from "@playwright/test";
import { waitForMic } from "./helpers";

// パートナーが消えて見える場面の総点検（0-3k）。パートナーを出す設定のとき、どの場面でも
// 会話のアイコン・大きな姿・最初の吹き出しのどれかで、パートナーがそこにいると分かる
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_avatar", value: "show", domain: "127.0.0.1", path: "/" }]);
});

const VIEWPORTS = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad縦", width: 820, height: 1180 },
  { name: "iPad横", width: 1180, height: 820 },
  { name: "パソコン", width: 1280, height: 800 },
];

const log = (page: Page) => page.locator("main.retro-home").getByRole("log");

async function say(page: Page, text: string) {
  const replies = log(page).locator(".bubble.assistant:not(.waiting)");
  const before = await replies.count();
  await page.getByLabel("パートナーに書く").fill(text);
  await page.getByLabel("パートナーに書く").press("Enter");
  await expect(replies).toHaveCount(before + 1);
}

/** 会話の中のパートナー：いちばん新しい返事と、その左のアイコンが見えている */
async function expectChatPartner(page: Page) {
  const row = log(page).locator(".chat-row.partner").filter({ has: page.locator(".chat-icon:not(.chat-icon-space)") }).last();
  await expect(row.locator(".chat-icon-art")).toBeVisible();
  await expect(row.locator(".chat-icon-art")).toBeInViewport();
  await expect(log(page).locator(".chat-row.partner .bubble").last()).toBeInViewport();
}

/** 話す前のパートナー：大きな姿と最初の吹き出しが見えている */
async function expectBigPartner(page: Page) {
  const companion = page.locator(".lcd-companion");
  await expect(companion.locator(".partner-tap > *").first()).toBeVisible();
  await expect(companion.locator(".partner-bubble")).toBeVisible();
  // 吹き出しの一言が最後まで出る（空の吹き出しのまま止まらない）
  await expect(companion.locator(".partner-bubble-rest")).toHaveText("", { timeout: 8000 });
  await expect(companion.locator(".partner-bubble")).not.toHaveText("");
}

/** 声の聞き取りを偽物にする（locked-talk.spec.ts と同じ形）。current.hear で話したことにする */
async function fakeVoice(page: Page) {
  await page.addInitScript(() => {
    const store = window as unknown as Record<string, unknown>;
    class FakeRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      continuous = false;
      text = "";
      start() {
        store.current = this;
      }
      stop() {
        if (this.text) this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: this.text }], { isFinal: true })] });
        this.onend?.();
      }
      hear(text: string) {
        this.text = text;
        this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: false })] });
      }
    }
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: FakeRecognition });
    window.speechSynthesis.speak = (utterance) => utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request: async () => ({ release: async () => {} }) },
    });
  });
}

/** マイクを押したまま上へ動かして、指を離す（歩きながら） */
async function swipeToLock(page: Page) {
  await waitForMic(page);
  const box = (await page.locator(".device-mic").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 40, { steps: 3 });
  await page.mouse.move(x, y - 90, { steps: 3 });
  await expect(page.getByRole("status").filter({ hasText: "歩きながら" })).toBeVisible();
  await page.mouse.up();
}

const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`) });

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} ${viewport.width}×${viewport.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    test("開いた直後・話した直後・新しく話した直後・前の話の欄で、パートナーが見える", async ({ page }) => {
      await page.goto("/");
      await expectBigPartner(page);
      await say(page, `ちょっと聞いて ${test.info().testId}`);
      await expectChatPartner(page);
      await shot(page, "1-話した直後");
      await page.getByRole("button", { name: "パートナー。押すと新しい話にできます" }).click();
      await page.getByRole("button", { name: "新しく話す" }).click();
      await expectBigPartner(page);
      await shot(page, "2-新しく話した直後");
      await say(page, "次の話です");
      await expectChatPartner(page);
      const archive = page.getByRole("region", { name: "前の話" });
      await expect(archive.locator(".chat-archive-line.partner .chat-icon-art").first()).toBeVisible();
      await shot(page, "3-前の話の欄");
    });

    test("歩きながら（手を離しても聞いている間）も、パートナーが見える", async ({ page }) => {
      await fakeVoice(page);
      await page.goto("/");
      await swipeToLock(page);
      // 聞いている間は、大きな姿が聞く形で残る
      await expect(page.locator(".lcd-companion").locator(".voice-lump, .dolphin").first()).toBeVisible();
      await shot(page, "7-歩きながら聞いている");
      await page.evaluate((text) => (window as unknown as { current: { hear(text: string): void } }).current.hear(text), `今日の授業、急に静かになった ${test.info().testId}`);
      await expect(log(page).locator(".bubble.assistant:not(.waiting)")).toHaveCount(1, { timeout: 8000 });
      await expect(page.getByRole("status").filter({ hasText: "歩きながら" })).toBeVisible();
      await expectChatPartner(page);
      await shot(page, "8-歩きながら返事のあと");
    });

    test("とどけるのシートを閉じたあとも、パートナーが見える", async ({ page }) => {
      await page.goto("/");
      await say(page, `今日の授業で、声を小さくしたらみんな聞いてくれた ${test.info().testId}`);
      await page.getByRole("button", { name: "とどける" }).click();
      const sheet = page.getByRole("dialog", { name: "こんな言葉でどうかな？" });
      await expect(sheet).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expectChatPartner(page);
      await shot(page, "4-とどけるを閉じたあと");
    });

    test("ありがとうのボタンから来て、下書きのシートを閉じたあとも、パートナーが見える", async ({ page }) => {
      await page.context().addCookies([{ name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" }]);
      await page.goto("/?thanks=noda");
      const sheet = page.getByRole("dialog", { name: "こんな言葉でどうかな？" });
      await expect(sheet).toBeVisible();
      await expect(log(page).locator(".chat-row.partner").filter({ hasText: "野田 翔さんへのカードの下書きを作るね" })).toHaveCount(1);
      await shot(page, "5-ありがとうから来た直後");
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expectChatPartner(page);
      await shot(page, "6-ありがとうの下書きを閉じたあと");
    });
  });
}
