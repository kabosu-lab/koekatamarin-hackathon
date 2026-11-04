import { openHomeSettings } from "./helpers";
import { expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";

const box = (page: Page) => page.getByRole("button", { name: "話しかける" }).boundingBox();

async function choose(page: Page, label: string) {
  await page.goto("/me");
  await page.getByRole("region", { name: "見た目" }).getByRole("button", { name: label }).click();
  await expect(page.getByRole("region", { name: "見た目" }).getByRole("button", { name: label })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

test("きせかえを変えると色は変わり、配置は変わらず、開き直しても残る", async ({ page }) => {
  // 出るときの動きの途中で位置を測らない
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const before = await box(page);
  const color = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const original = await color();

  await choose(page, "ゲーム");
  await page.goto("/");
  expect(await color()).not.toBe(original);
  expect(await page.locator("html").getAttribute("data-theme")).toBe("game");
  expect(await box(page)).toEqual(before);

  await page.reload();
  expect(await page.locator("html").getAttribute("data-theme")).toBe("game");

  await choose(page, "くっきり");
  await page.goto("/");
  expect(await box(page)).toEqual(before);
});

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

test("音は初めから入っていて、最初の画面ですぐ消せて、設定が残る", async ({ page }) => {
  await page.goto("/");
  expect(await page.locator("html").getAttribute("data-sound")).toBe("on");
  await openHomeSettings(page);
  await page.getByRole("button", { name: "音 オン" }).click();
  await expect(page.getByRole("button", { name: "音 オフ" })).toBeVisible();
  expect(await page.locator("html").getAttribute("data-sound")).toBe("off");
  await page.reload();
  await openHomeSettings(page);
  await expect(page.getByRole("button", { name: "音 オフ" })).toBeVisible();
  await page.goto("/me");
  await expect(page.getByRole("button", { name: "音を試す" })).toHaveCount(0);
  await choose(page, "音あり");
  expect(await page.locator("html").getAttribute("data-sound")).toBe("on");
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
  await page.goto("/");
  await expect(page.locator(".home-settings")).toBeVisible();
  expect(await made()).toBe(0);
});

test("音を消すと、送っても音を作らない", async ({ page }) => {
  const made = await countAudio(page);
  await page.goto("/");
  await openHomeSettings(page);
  await page.getByRole("button", { name: "音 オン" }).click();
  await expect(page.getByRole("button", { name: "音 オフ" })).toBeVisible();
  await send(page, `静かな言葉 ${test.info().testId}`);
  await expect(page.locator(".sent")).toBeVisible();
  expect(await made()).toBe(0);
});

test("音が入っていれば、送ったときに音を作る", async ({ page }) => {
  const made = await countAudio(page);
  await send(page, `鳴らす言葉 ${test.info().testId}`);
  await expect(page.locator(".sent")).toBeVisible();
  expect(await made()).toBeGreaterThan(0);
});

async function send(page: Page, words: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill(words);
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "言葉にして送る" }).click();
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
  await page.goto("/me");
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

test("分身が今日のカードと校内チャネルでも見える", async ({ page }) => {
  await page.goto("/today");
  await expect(page.locator(".today-card .avatar-image")).toBeVisible();
  await page.goto("/teams?channel=making");
  await expect(page.getByRole("article").first().locator(".avatar-image").first()).toBeVisible();
});

test("音ありで応援しても、画面が乱れない", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/me");
  await expect(page.getByRole("button", { name: "音を試す" })).toBeVisible();
  await page.goto("/today");
  const cheer = page.getByRole("button", { name: "応援する" });
  // すでに応援した投稿は飛ばす
  const next = page.getByRole("button", { name: /^(次へ|もっと見る)$/ });
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

test("ポップの最初の画面は、黄色の面に分身がいる", async ({ page }) => {
  await page.goto("/");
  expect(await page.locator("html").getAttribute("data-theme")).toBe("pop");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--stage").trim())).toBe("#ffd23f");
  await expect(page.locator(".speaker")).toBeVisible();
});

test("ポップの最初の画面は、リボンの知らせと話す画面が一緒に出ても崩れない", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addCookies([{ name: "koekata_theme", value: "pop", url: "http://127.0.0.1:3100" }]);
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /same key/.test(message.text())) problems.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "話しかける" })).toBeVisible();
  expect(problems).toEqual([]);
  await context.close();
});
