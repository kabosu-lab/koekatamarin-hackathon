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
  await expect(page.getByRole("status").filter({ hasText: "歩きながら" })).toBeVisible();
  await page.mouse.up();
}

const log = (page: Page) => page.getByRole("log");

// 0-1h：上だけでなく、下・左・右へずらしても固定になる。押している間の左右のずらしで画面は切り替わらない
for (const [name, dx, dy] of [
  ["下", 0, 90],
  ["左", -90, 0],
  ["右", 90, 0],
] as const) {
  test(`押したまま${name}へずらしても固定になり、画面は切り替わらない`, async ({ page }) => {
    await fakeVoice(page);
    await page.goto("/");
    await waitForMic(page);
    const box = (await page.locator(".device-mic").boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(page.locator(".lock-hint")).toContainText("ずらすと固定");
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
    await page.mouse.move(x + dx, y + dy, { steps: 3 });
    await expect(page.getByRole("status").filter({ hasText: "歩きながら" })).toBeVisible();
    await page.mouse.up();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("status").filter({ hasText: "歩きながら" })).toBeVisible();
  });
}

test("押したまま上へ動かすと固定になり、離しても聞き続け、止めるとパートナーへ送る", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/");
  await swipeToLock(page);
  await page.waitForTimeout(300);
  await expect(page.getByRole("status").filter({ hasText: "歩きながら" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { wakeLocked: boolean }).wakeLocked)).toBe(true);
  await hear(page, `帰り道の気づき ${test.info().testId}`);
  await expect(page.locator(".device-heard")).toContainText("帰り道の気づき");
  await expect(log(page).locator(".bubble.user")).toHaveCount(0);

  await page.getByRole("button", { name: "話し終えて送る" }).first().click();
  await expect(log(page).locator(".bubble.user").last()).toContainText("帰り道の気づき");
  await expect(page.getByText("歩きながら ─ 手を離しても聞いています")).toHaveCount(0);
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
  await expect(page.getByText("歩きながら ─ 手を離しても聞いています")).toHaveCount(0);
});

test("固定中に「どう思う？」と言うとパートナーが答え、聞いた分は二重に送らない", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/");
  await swipeToLock(page);
  await hear(page, "この工夫どう思う？");
  await expect(log(page).locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  await expect(page.getByText("歩きながら ─ 手を離しても聞いています")).toBeVisible();
  // 読み上げの間は止めた聞き取りを、終わったら続きから始める
  await expect.poll(() => page.evaluate(() => (window as unknown as { starts: number }).starts)).toBeGreaterThan(1);
  await hear(page, "続きの話");
  await page.getByRole("button", { name: "話し終えて送る" }).first().click();
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
  await expect(page.getByText("歩きながら ─ 手を離しても聞いています")).toBeVisible();
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
  await expect(page.getByText("歩きながら ─ 手を離しても聞いています")).toHaveCount(0);
});

test("キーボードでは押すと固定と同じ動きになる", async ({ page }) => {
  await fakeVoice(page);
  await page.goto("/");
  await page.locator(".device-mic").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "歩きながら" })).toBeVisible();
  await hear(page, "キーボードの話");
  await page.keyboard.press("Enter");
  await expect(log(page).locator(".bubble.user").last()).toContainText("キーボードの話");
});

test("0-1t：歩きながらは、話の切れ目で自動で送り、返事を声で読み、そのまま聞き続ける", async ({ page }) => {
  await fakeVoice(page);
  await page.addInitScript(() => {
    const store = window as unknown as { spoken: string[] };
    store.spoken = [];
    const original = window.speechSynthesis.speak;
    window.speechSynthesis.speak = (utterance) => {
      store.spoken.push(utterance.text);
      original.call(window.speechSynthesis, utterance);
    };
  });
  await page.goto("/");
  await swipeToLock(page);
  await expect(page.getByRole("status").filter({ hasText: "歩きながら ─ 手を離しても聞いています" })).toBeVisible();
  await hear(page, `今日の授業、急に静かになった瞬間があって ${test.info().testId}`);
  // 1.5秒黙ると、ボタンを押さなくてもパートナーへ送られる
  await expect(log(page).locator(".bubble.assistant:not(.waiting)")).toHaveCount(1, { timeout: 8000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken.length)).toBeGreaterThan(0);
  // 聞き取りは続いている
  await expect(page.getByRole("status").filter({ hasText: "歩きながら" })).toBeVisible();
  await expect(page.getByRole("button", { name: "話し終えて送る" }).first()).toBeVisible();
});

// 0-3l：パートナーの読み上げを、マイクが本人の言葉として拾わない。読み上げは少し速く、最初の一文から読む
test("0-3l：読み上げ中や直後に聞き取りが読み上げを拾っても、本人の言葉に入れない", async ({ page }) => {
  await fakeVoice(page);
  await page.addInitScript(() => {
    const store = window as unknown as {
      spoken: { text: string; rate: number }[];
      held: SpeechSynthesisUtterance[];
      endSpeech(): void;
      pendingEnds: (() => void)[];
      webkitSpeechRecognition: { prototype: { stop(): void } };
    };
    store.spoken = [];
    store.held = [];
    store.pendingEnds = [];
    // 読み上げは endSpeech() を呼ぶまで続いていることにする
    window.speechSynthesis.speak = (utterance) => {
      store.spoken.push({ text: utterance.text, rate: utterance.rate });
      store.held.push(utterance);
    };
    // 実機のように、止めても終わりの知らせはすぐ来ない（その間も読み上げを拾う）
    store.webkitSpeechRecognition.prototype.stop = function (this: { onend: (() => void) | null }) {
      store.pendingEnds.push(() => this.onend?.());
    };
    store.endSpeech = () => {
      store.pendingEnds.splice(0).forEach((end) => end());
      store.held.splice(0).forEach((utterance) => utterance.onend?.(new Event("end") as SpeechSynthesisEvent));
    };
  });
  await page.goto("/");
  await swipeToLock(page);
  await hear(page, "この工夫どう思う？");
  await expect(log(page).locator(".bubble.assistant:not(.waiting)")).toHaveCount(1, { timeout: 8000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { spoken: unknown[] }).spoken.length)).toBeGreaterThan(0);
  const spoken = await page.evaluate(() => (window as unknown as { spoken: { text: string; rate: number }[] }).spoken);
  // 吹き出しの頭には、読み上げ用の「パートナー：」が付いている
  const reply = (await log(page).locator(".bubble.assistant:not(.waiting)").last().innerText()).replace(/\s/g, "").replace(/^パートナー[：:]/, "");
  // 最初の一文を、ひとつの読み上げとして先に読み始める
  const firstSentence = (reply.match(/[^。！？!?]+[。！？!?]*/) ?? [reply])[0];
  expect(spoken[0].text.replace(/\s/g, "")).toBe(firstSentence);
  for (const { rate } of spoken) expect(rate).toBeCloseTo(1.15, 2);
  const echo = spoken.map((item) => item.text).join("");
  const mark = spoken[0].text.slice(0, 6);
  const starts = await page.evaluate(() => (window as unknown as { starts: number }).starts);

  // 読み上げの間：止めた聞き取りに読み上げが入っても、本人の言葉にしない。聞き直しもしない
  await hear(page, `この工夫どう思う？${echo}`);
  await page.waitForTimeout(400);
  await expect(page.locator(".device-heard")).not.toContainText(mark);
  expect(await page.evaluate(() => (window as unknown as { starts: number }).starts)).toBe(starts);

  // 話し終えてから聞き直す。その直後に読み上げの残りを拾っても捨てる
  await page.evaluate(() => (window as unknown as { endSpeech(): void }).endSpeech());
  await expect.poll(() => page.evaluate(() => (window as unknown as { starts: number }).starts)).toBeGreaterThan(starts);
  await hear(page, echo);
  await page.waitForTimeout(300);
  await expect(page.locator(".device-heard")).not.toContainText(mark);
  await hear(page, "続きの話");
  await page.getByRole("button", { name: "話し終えて送る" }).first().click();
  const users = log(page).locator(".bubble.user");
  await expect(users).toHaveCount(2);
  await expect(users.last()).toContainText("続きの話");
  await expect(users.last()).not.toContainText(mark);
});
