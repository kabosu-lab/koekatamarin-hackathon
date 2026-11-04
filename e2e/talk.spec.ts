import { expect, type Page, test } from "@playwright/test";

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
  await page.getByRole("button", { name: "話しかける" }).click();
  const stop = page.getByRole("button", { name: "話し終わった" });
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

  await stop.click();
  await expect(page.getByRole("log").locator(".bubble.user").last()).toHaveText(/文化祭の動画できました/);
});

test("最初の画面の主役は「話しかける」と「文字で書く」", async ({ page }) => {
  await page.goto("/");
  // 下の案内に隠れず、最初から画面に入っている
  await expect(page.getByRole("button", { name: "話しかける" })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "文字で書く" })).toBeInViewport({ ratio: 1 });
});

test("声で話すと、聞いている様子を見せ、話した言葉を残して相棒が返す", async ({ page }) => {
  await fakeSpeech(page, "私は嫌やわ");
  await page.goto("/");

  await page.getByRole("button", { name: "話しかける" }).click();
  await expect(page.getByText("聞いています…")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { fakeLang: string }).fakeLang)).toBe("ja-JP");

  await page.getByRole("button", { name: "話し終わった" }).click();

  const log = page.getByRole("log");
  await expect(log.locator(".bubble.user")).toHaveText(/私は嫌やわ/);
  await expect(log.locator(".bubble.assistant")).toContainText("無理に使わんでええ");
  await expect(page.getByText("聞いています…")).toHaveCount(0);
});

test("文字で書いて、会話を続けられる", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "文字で書く" }).click();

  const input = page.getByLabel("相棒に書く");
  await input.fill("こんにちは");
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant")).toContainText("今日はどんな一日");
  await expect(input).toHaveValue("");

  await input.fill("あんた何ができるん");
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant")).toHaveCount(2);
});

test("台本で動いているときは、そのことを隠さない", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill("こんにちは");
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByText("いまは台本で動いています")).toBeVisible();
});

test("声が使えないブラウザでは、文字で書く欄へ案内する", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });
  await page.goto("/");

  await page.getByRole("button", { name: "話しかける" }).click();

  await expect(page.locator(".notice")).toContainText("文字で書いてください");
  await expect(page.getByLabel("相棒に書く")).toBeVisible();
});

test("つながらないときは、話した言葉を失わない", async ({ page }) => {
  await page.route("**/api/converse", (route) => route.fulfill({ status: 503, json: { error: "x" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill("大事な話");
  await page.getByRole("button", { name: "相棒に送る" }).click();

  await expect(page.locator(".notice")).toContainText("もう一度送って");
  await expect(page.getByLabel("相棒に書く")).toHaveValue("大事な話");
  await expect(page.getByRole("log").locator(".bubble.user")).toHaveCount(0);
});
