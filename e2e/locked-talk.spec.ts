import { expect, type Page, test } from "@playwright/test";
import { waitForMic } from "./helpers";

// トロフィーが届いた瞬間の全画面の知らせが、マイクの前に重ならないようにする
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_avatar", value: "hide", domain: "127.0.0.1", path: "/" }]);
});

/** 声の聞き取りを偽物にする。hear で話したことにする。 */
async function fakeVoice(page: Page) {
  await page.addInitScript(() => {
    const store = window as unknown as Record<string, unknown>;
    store.starts = 0;
    store.wakeLocked = false;
    class FakeRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      continuous = false;
      text = "";
      start() {
        store.current = this;
        store.starts = (store.starts as number) + 1;
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
    // 読み上げはすぐ終わったことにする
    window.speechSynthesis.speak = (utterance) => utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          store.wakeLocked = true;
          return { release: async () => void (store.wakeLocked = false) };
        },
      },
    });
  });
}

const hear = (page: Page, words: string) =>
  page.evaluate((text) => (window as unknown as { current: { hear(text: string): void } }).current.hear(text), words);

/** マイクを押したまま上へ動かして、指を離す。 */
async function swipeToLock(page: Page) {
  await waitForMic(page);
  const mic = page.locator(".device-mic");
  const box = (await mic.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 40, { steps: 3 });
  await page.mouse.move(x, y - 90, { steps: 3 });
  await expect(page.getByRole("status").filter({ hasText: "固定中" })).toBeVisible();
  await page.mouse.up();
}

const log = (page: Page) => page.getByRole("log");

test("押したまま上へ動かすと固定になり、離しても聞き続け、止めると相棒へ送る", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/");
  await swipeToLock(page);
  await page.waitForTimeout(300);
  await expect(page.getByRole("status").filter({ hasText: "固定中" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { wakeLocked: boolean }).wakeLocked)).toBe(true);
  await hear(page, `帰り道の気づき ${test.info().testId}`);
  await expect(page.locator(".device-heard")).toContainText("帰り道の気づき");
  await expect(log(page).locator(".bubble.user")).toHaveCount(0);

  await page.getByRole("button", { name: "止めて送る" }).first().click();
  await expect(log(page).locator(".bubble.user").last()).toContainText("帰り道の気づき");
  await expect(page.getByText("固定中")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { wakeLocked: boolean }).wakeLocked)).toBe(false);
  // Teams へは送らない
  await expect(page.getByRole("button", { name: "本人として送る" })).toHaveCount(0);
});

test("固定中は真ん中のマイクを押しても止まる。固定した指を離しただけでは止まらない", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/");
  await swipeToLock(page);
  await hear(page, "マイクで止める");
  await expect(page.locator(".device-heard")).toContainText("マイクで止める");
  await page.locator(".device-mic").click();
  await expect(log(page).locator(".bubble.user").last()).toContainText("マイクで止める");
});

test("「終わり」と言うと止まり、「終わり」を除いて送る", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/");
  await swipeToLock(page);
  await hear(page, "今日の工夫を話した。終わり");
  await expect(log(page).locator(".bubble.user").last()).toContainText("今日の工夫を話した");
  await expect(log(page).locator(".bubble.user").last()).not.toContainText("終わり");
  await expect(page.getByText("固定中")).toHaveCount(0);
});

test("固定中に「どう思う？」と言うと相棒が答え、聞いた分は二重に送らない", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/");
  await swipeToLock(page);
  await hear(page, "この工夫どう思う？");
  await expect(log(page).locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  await expect(page.getByText("固定中")).toBeVisible();
  // 読み上げの間は止めた聞き取りを、終わったら続きから始める
  await expect.poll(() => page.evaluate(() => (window as unknown as { starts: number }).starts)).toBeGreaterThan(1);
  await hear(page, "続きの話");
  await page.getByRole("button", { name: "止めて送る" }).first().click();
  const users = log(page).locator(".bubble.user");
  await expect(users).toHaveCount(2);
  await expect(users.last()).toContainText("続きの話");
  await expect(users.last()).not.toContainText("どう思う");
});

test("固定中でも、長い話の途中で命や安全の案内を出す", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/");
  await swipeToLock(page);
  await hear(page, `${"あ".repeat(400)}親に殴られている`);
  await expect(page.getByRole("region", { name: "相談室に伝えました" })).toBeVisible();
  await expect(page.getByText("固定中")).toBeVisible();
});

test("短く触っただけでは固定にならず、上へ動かさず離すと今までどおり送る", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/");
  await page.locator(".device-mic").hover();
  await page.mouse.down();
  await expect(page.getByRole("button", { name: "離すと送る" })).toBeVisible();
  await hear(page, "押している間の話");
  await page.waitForTimeout(350);
  await page.mouse.up();
  await expect(log(page).locator(".bubble.user").last()).toContainText("押している間の話");
  await expect(page.getByText("固定中")).toHaveCount(0);
});

test("キーボードでは押すと固定と同じ動きになる", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/");
  await page.locator(".device-mic").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "固定中" })).toBeVisible();
  await hear(page, "キーボードの話");
  await page.keyboard.press("Enter");
  await expect(log(page).locator(".bubble.user").last()).toContainText("キーボードの話");
});
