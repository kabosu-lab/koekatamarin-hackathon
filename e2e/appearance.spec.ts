import { expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";

const box = (page: Page) => page.getByRole("button", { name: "押し続けて話す" }).boundingBox();

async function choose(page: Page, label: string) {
  await page.goto("/me?open=settings");
  await page.getByRole("region", { name: "見た目" }).getByRole("button", { name: label }).click();
  await expect(page.getByRole("region", { name: "見た目" }).getByRole("button", { name: label })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

test("文字を大きくしても、どの画面も横にはみ出さない", async ({ page }) => {
  await choose(page, "とても大きい");
  for (const path of ["/", "/me", "/inbox", "/today", "/minna", "/daily", "/study", "/soudan", "/teams"]) {
    await page.goto(path);
    expect(await page.locator("html").getAttribute("data-size")).toBe("xlarge");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBe(0);
  }
});

/** 作られた音の部品を数える。 */
async function countAudio(page: Page) {
  await page.addInitScript(() => {
    const Real = window.AudioContext;
    const counter = window as unknown as { audioMade: number };
    counter.audioMade = 0;
    window.AudioContext = class extends Real {
      constructor() {
        super();
        counter.audioMade++;
      }
    };
  });
  return () => page.evaluate(() => (window as unknown as { audioMade: number }).audioMade);
}

test("開いただけでは鳴らさない", async ({ page }) => {
  const made = await countAudio(page);
  // トロフィーが届いた瞬間の音は別なので、報酬を隠して見る
  await page.context().addCookies([{ name: "koekata_avatar", value: "hide", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/");
  await expect(page.locator(".device-mic")).toBeVisible();
  expect(await made()).toBe(0);
});

test("0-1v：アプリの中で音を消す設定はなく、前に「音なし」を選んでいても音は鳴る", async ({ page }) => {
  const made = await countAudio(page);
  await page.context().addCookies([{ name: "koekata_sound", value: "off", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/me?open=settings");
  await expect(page.getByRole("button", { name: "音なし" })).toHaveCount(0);
  await send(page, `前は静かにしていた言葉 ${test.info().testId}`);
  await expect(page.locator(".sent")).toBeVisible();
  expect(await made()).toBeGreaterThan(0);
});

test("音が入っていれば、送ったときに音を作る", async ({ page }) => {
  const made = await countAudio(page);
  await send(page, `鳴らす言葉 ${test.info().testId}`);
  await expect(page.locator(".sent")).toBeVisible();
  expect(await made()).toBeGreaterThan(0);
});

async function send(page: Page, words: string) {
  await page.goto("/");
  await page.getByLabel("パートナーに書く").fill(words);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "とどける" }).click();
  await page.getByRole("button", { name: "本人として送る" }).click();
}

test("送ると言葉が飛び、花びらになって、消える", async ({ page }) => {
  const words = `飛ばす言葉 ${test.info().testId}`;
  await send(page, words);
  await expect(page.locator(".send-burst .word").first()).toBeAttached();
  await expect(page.locator(".send-burst .blob")).toBeAttached();
  await expect(page.locator(".send-burst .burst-petal").first()).toBeAttached();
  await expect(page.locator(".send-burst")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator(".sent")).toBeVisible();
});

test("音ありでは音を試せて、送っても画面が乱れない", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/me?open=settings");
  await page.getByRole("button", { name: "音を試す" }).click();
  await send(page, `音の言葉 ${test.info().testId}`);
  await expect(page.locator(".sent")).toBeVisible();
  expect(problems).toEqual([]);
});

test("動きを減らす設定では、飛ばさない", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await send(page, `動かさない言葉 ${test.info().testId}`);
  await expect(page.locator(".sent")).toBeVisible();
  await expect(page.locator(".send-burst")).toBeHidden();
});

test("パートナーが今日のカードと校内チャネルでも見える", async ({ page }) => {
  await page.goto("/today");
  await expect(page.locator(".today-card .avatar-image")).toBeVisible();
  await page.goto("/teams?channel=making");
  await expect(page.getByRole("article").first().locator(".avatar-image").first()).toBeVisible();
});

test("音ありで応援しても、画面が乱れない", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/me?open=settings");
  await expect(page.getByRole("button", { name: "音を試す" })).toBeVisible();
  await page.goto("/today");
  const cheer = page.getByRole("button", { name: "応援する" });
  // すでに応援した投稿は飛ばす
  const next = page.getByRole("button", { name: /^(次へ|次のおすすめを見る.*)$/ });
  while ((await cheer.count()) === 0) await next.first().click();
  await cheer.click();
  await expect(page.getByRole("button", { name: "応援しました" }).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test("送るときの音は、実物のブラウザで例外なく作れて、ちゃんと鳴る", async ({ page }) => {
  const { outputFiles } = await build({
    entryPoints: ["src/lib/send-sound.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "sendSound",
  });
  await page.goto("/me");
  await page.addScriptTag({ content: outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const audio = new OfflineAudioContext(1, 44100 * 4, 44100);
    (window as unknown as { sendSound: { scheduleSendSound(a: BaseAudioContext, o: AudioNode, t: number, n: number): void } }).sendSound.scheduleSendSound(audio, audio.destination, 0.02, 5);
    const data = (await audio.startRendering()).getChannelData(0);
    return { peak: data.reduce((max, value) => Math.max(max, Math.abs(value)), 0), finite: data.every(Number.isFinite) };
  });
  expect(result.finite).toBe(true);
  expect(result.peak).toBeGreaterThan(0.05);
});
