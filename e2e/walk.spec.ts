import { expect, type Page, test } from "@playwright/test";

/** 声の聞き取りと読み上げを偽物にする。`hear` で話したことにする。 */
async function fakeVoice(page: Page) {
  await page.addInitScript(() => {
    const store = window as unknown as Record<string, unknown>;
    store.spokenWords = [];
    store.micStops = 0;
    class FakeRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      start() {
        store.current = this;
      }
      stop() {
        store.micStops = (store.micStops as number) + 1;
        this.onend?.();
      }
      hear(text: string) {
        this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
      }
    }
    class FakeUtterance {
      lang = "";
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    Object.assign(window, {
      webkitSpeechRecognition: FakeRecognition,
      SpeechRecognition: FakeRecognition,
      SpeechSynthesisUtterance: FakeUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak(utterance: FakeUtterance) {
          (store.spokenWords as string[]).push(utterance.text);
          setTimeout(() => utterance.onend?.(), 10);
        },
        cancel() {},
      },
    });
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        async request() {
          store.wakeLocked = true;
          return {
            async release() {
              store.wakeLocked = false;
            },
          };
        },
      },
    });
  });
}

const hear = (page: Page, text: string) =>
  page.evaluate((words) => (window as unknown as { current: { hear(text: string): void } }).current.hear(words), text);

const spokenWords = (page: Page) => page.evaluate(() => (window as unknown as { spokenWords: string[] }).spokenWords);

test("最初の画面から入り、画面を点けたまま聞き、「終わり」で整理して複数の下書きを出す", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/");
  await page.getByRole("link", { name: "歩きながら話す" }).click();
  await expect(page.getByRole("heading", { name: "歩きながら話す" })).toBeVisible();
  await expect(page.getByText("画面を消すと聞き取りも止まります")).toBeVisible();

  await page.getByRole("button", { name: "話し始める" }).click();
  await expect(page.getByRole("status")).toHaveText("聞いています");
  await expect(page.getByText("画面を消すと止まります")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { wakeLocked: boolean }).wakeLocked)).toBe(true);

  await hear(page, `しおり立てができた ${test.info().testId}。終わり`);
  await expect(page.getByRole("region", { name: "話の整理" })).toBeVisible();
  const drafts = page.getByRole("region", { name: "投稿の下書き" }).locator("article");
  await expect(drafts).toHaveCount(3);
  await expect(page.getByRole("region", { name: "話の整理" })).not.toContainText("終わり");
  await expect(page.getByText("AI は送りません")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { wakeLocked: boolean }).wakeLocked)).toBe(false);

  // 本人が選んで確かめてから送る
  await drafts.first().getByRole("button", { name: "これを確かめて送る" }).click();
  await page.getByRole("button", { name: "本人として送る" }).click();
  await expect(page.getByText("届けました。")).toBeVisible();
});

test("「どう思う？」と言ったときだけ相棒が声で答え、読み上げの間はマイクを止める", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/walk");
  await page.getByRole("button", { name: "話し始める" }).click();
  await expect(page.getByRole("status")).toHaveText("聞いています");

  await hear(page, "小テストの作り方で迷っててな");
  await page.waitForTimeout(1500);
  expect(await spokenWords(page)).toEqual([]);

  await hear(page, "小テストの作り方で迷っててな。どう思う？");
  await expect(page.locator(".walk-reply")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => spokenWords(page).then((words) => words.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { micStops: number }).micStops)).toBeGreaterThan(0);
});

test("間が空くと短い合いの手を入れ、切ると入れない", async ({ page }) => {
  await fakeVoice(page);
  await page.clock.install();
  await page.goto("/walk");
  await page.getByRole("button", { name: "話し始める" }).click();
  await expect(page.getByRole("status")).toHaveText("聞いています");
  await page.clock.fastForward(50_000);
  await hear(page, "今日はよう歩いた");
  await page.clock.fastForward(5000);
  await expect.poll(() => spokenWords(page).then((words) => words.length)).toBe(1);
  expect((await spokenWords(page))[0].length).toBeLessThanOrEqual(6);

  await page.getByLabel("合いの手を入れる").uncheck();
  await page.clock.fastForward(50_000);
  await hear(page, "今日はよう歩いたわ、ほんまに");
  await page.clock.fastForward(5000);
  expect(await spokenWords(page).then((words) => words.length)).toBe(1);
});

test("音を消していると、声を出さない", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/walk");
  await page.evaluate(() => {
    document.documentElement.dataset.sound = "off";
  });
  await page.getByRole("button", { name: "話し始める" }).click();
  await hear(page, "どう思う？");
  await expect(page.locator(".walk-reply")).toBeVisible({ timeout: 15_000 });
  expect(await spokenWords(page)).toEqual([]);
});

test("命や安全に関わる話は、歩いている間でも画面と声で案内する", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/walk");
  await page.getByRole("button", { name: "話し始める" }).click();
  await hear(page, "親に殴られている。どう思う？");
  await expect(page.getByRole("region", { name: "相談室に伝えました" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => spokenWords(page).then((words) => words.join(""))).toContain("相談室");
});

for (const [name, width] of [["スマホ", 412], ["iPad", 768], ["PC", 1280]] as const) {
  test(`${name}の幅で横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fakeVoice(page);
    await page.goto("/walk");
    await page.getByRole("button", { name: "話し始める" }).click();
    await hear(page, "とても長い話を続けています".repeat(20));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
}
