import { expect, type Page, test } from "@playwright/test";
import { holdMic } from "./helpers";

/** 本物の音声認識の代わりに、決めた言葉を聞き取ったことにする。 */
async function fakeSpeech(page: Page, spoken: string) {
  await page.addInitScript((text) => {
    class FakeRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      start() {
        (window as unknown as Record<string, unknown>).fakeRecognition = this;
        (window as unknown as Record<string, unknown>).fakeLang = (this as unknown as { lang: string }).lang;
      }
      stop() {
        const result = Object.assign([{ transcript: text }], { isFinal: true });
        this.onresult?.({ resultIndex: 0, results: [result] });
        this.onend?.();
      }
    }
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: FakeRecognition });
  }, spoken);
}

test("息つぎでブラウザが認識を終えても、押すまで聞き続けて、言葉をつなげて渡す", async ({ page }) => {
  await page.addInitScript(() => {
    const store = window as unknown as Record<string, unknown>;
    class BreathingRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      continuous = false;
      start() {
        store.current = this;
        store.startCount = ((store.startCount as number) ?? 0) + 1;
        store.continuousFlag = this.continuous;
      }
      stop() {
        this.onend?.();
      }
      breath(text: string) {
        this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
        this.onend?.();
      }
    }
    Object.assign(window, { webkitSpeechRecognition: BreathingRecognition, SpeechRecognition: BreathingRecognition });
  });
  await page.goto("/");
  await page.locator(".device-mic").hover();
  await page.mouse.down();
  const stop = page.getByRole("button", { name: "離すと送る" });
  await expect(stop).toBeVisible();

  const breath = (text: string) =>
    page.evaluate((words) => {
      const store = window as unknown as { current: { breath(text: string): void } };
      store.current.breath(words);
    }, text);
  await page.waitForTimeout(1100);
  await breath("文化祭の動画");
  await expect.poll(() => page.evaluate(() => (window as unknown as { startCount: number }).startCount)).toBe(2);
  await expect(stop).toBeVisible();
  await page.waitForTimeout(1100);
  await breath("できました");
  await expect.poll(() => page.evaluate(() => (window as unknown as { startCount: number }).startCount)).toBe(3);
  await expect(stop).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { continuousFlag: boolean }).continuousFlag)).toBe(true);

  await page.mouse.up();
  await expect(page.getByRole("log").locator(".bubble.user").last()).toHaveText(/文化祭の動画できました/);
});

test("声で話すと、聞いている様子を見せ、話した言葉を残して相棒が返す", async ({ page }) => {
  await fakeSpeech(page, "私は嫌やわ");
  await page.goto("/");

  await page.locator(".device-mic").hover();
  await page.mouse.down();
  await expect(page.getByText("聞いています…")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { fakeLang: string }).fakeLang)).toBe("ja-JP");

  await page.waitForTimeout(400);
  await page.mouse.up();

  // 送るボタンを押さなくても相棒へ送られる
  const log = page.getByRole("log");
  await expect(log.locator(".bubble.user")).toHaveText(/私は嫌やわ/);
  await expect(log.locator(".bubble.assistant")).toContainText("無理に使わんでええ");
  await expect(page.getByText("聞いています…")).toHaveCount(0);
});

test("文字で書いて、会話を続けられる", async ({ page }) => {
  await page.goto("/");

  const input = page.getByLabel("相棒に書く");
  await input.fill("こんにちは");
  await page.getByRole("button", { name: "相棒へ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant")).toContainText("今日はどんな一日");
  await expect(input).toHaveValue("");

  await input.fill("あんた何ができるん");
  await page.getByRole("button", { name: "相棒へ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant")).toHaveCount(2);
});

test("台本で動いているときは、そのことを隠さない", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("相棒に書く").fill("こんにちは");
  await page.getByRole("button", { name: "相棒へ送る" }).click();
  await expect(page.getByText("いまは台本で動いています")).toBeVisible();
});

test("声が使えないブラウザでは、文字で書く欄へ案内する", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });
  await page.goto("/");

  await holdMic(page);

  await expect(page.locator(".notice")).toContainText("文字で書いてください");
  await expect(page.getByLabel("相棒に書く")).toBeVisible();
});

test("つながらないときは、話した言葉を失わない", async ({ page }) => {
  await page.route("**/api/converse", (route) => route.fulfill({ status: 503, json: { error: "x" } }));
  await page.goto("/");
  await page.getByLabel("相棒に書く").fill("大事な話");
  await page.getByRole("button", { name: "相棒へ送る" }).click();

  await expect(page.locator(".notice")).toContainText("もう一度送って");
  await expect(page.getByLabel("相棒に書く")).toHaveValue("大事な話");
  await expect(page.getByRole("log").locator(".bubble.user")).toHaveCount(0);
});

test("短く触っただけでは聞いた言葉を送らず、押し続けて話すと案内する", async ({ page }) => {
  await fakeSpeech(page, "途中の言葉");
  await page.goto("/");
  await page.getByRole("button", { name: "押し続けて話す" }).click();
  await expect(page.locator(".notice")).toContainText("押し続けて話す");
  await expect(page.getByRole("log").locator(".bubble.user")).toHaveCount(0);
  await expect(page.getByLabel("相棒に書く")).toHaveValue("");
});

test("言葉が何もなければ、押し続けても送らない", async ({ page }) => {
  await fakeSpeech(page, "");
  let sent = 0;
  await page.route("**/api/converse", (route) => {
    sent += 1;
    return route.continue();
  });
  await page.goto("/");
  await holdMic(page);
  await expect(page.getByLabel("相棒に書く")).toBeVisible();
  expect(sent).toBe(0);
});

test("書きかけの文字があれば、声とつなげて送る", async ({ page }) => {
  await fakeSpeech(page, "声の続き");
  await page.goto("/");
  await page.getByLabel("相棒に書く").fill("書いた言葉");
  await holdMic(page);
  await expect(page.getByRole("log").locator(".bubble.user").last()).toHaveText(/書いた言葉\s*声の続き/);
  await expect(page.getByLabel("相棒に書く")).toHaveValue("");
});

test("キーボードでは押すたびに始める、止めるを切り替える", async ({ page }) => {
  await fakeSpeech(page, "キーボードの声");
  await page.goto("/");
  await page.locator(".device-mic").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("聞いています…")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("log").locator(".bubble.user").last()).toHaveText(/キーボードの声/);
});

test("文字は Enter で送り、変換を決める Enter では送らない。右のボタンは状況で変わる", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("相棒に書く");
  await expect(page.getByRole("button", { name: "とどける" })).toBeDisabled();
  await input.fill("変換中");
  await expect(page.getByRole("button", { name: "相棒へ送る" })).toBeEnabled();
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true, bubbles: true });
  await expect(input).toHaveValue("変換中");
  await input.press("Enter");
  await expect(page.getByRole("log").locator(".bubble.user").last()).toHaveText(/変換中/);
  await expect(page.getByRole("button", { name: "とどける" })).toBeEnabled();
});

test("話す言葉が増えても、最新の行がテキスト欄に見えて、欄の高さは変わらない", async ({ page }) => {
  await page.addInitScript(() => {
    const store = window as unknown as Record<string, unknown>;
    class GrowingRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      start() {
        store.current = this;
      }
      stop() {
        this.onend?.();
      }
      say(text: string) {
        this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: false })] });
      }
    }
    Object.assign(window, { webkitSpeechRecognition: GrowingRecognition, SpeechRecognition: GrowingRecognition });
  });
  await page.goto("/");
  await page.locator(".device-mic").hover();
  await page.mouse.down();
  const heard = page.locator(".device-heard");
  await expect(heard).toBeVisible();
  const first = await heard.boundingBox();
  await page.evaluate(() => {
    const store = window as unknown as { current: { say(text: string): void } };
    store.current.say(`${"はじめの言葉".repeat(40)}さいごの言葉`);
  });
  await expect(heard).toContainText("さいごの言葉");
  await expect
    .poll(() => heard.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight))
    .toBeLessThanOrEqual(1);
  expect((await heard.boundingBox())?.height).toBe(first?.height);
  expect(await heard.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.mouse.up();
});
