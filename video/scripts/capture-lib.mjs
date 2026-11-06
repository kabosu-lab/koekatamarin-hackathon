/* 撮影スクリプトの共通部分。Windows でも Mac でも同じに動くよう、場所は fileURLToPath で作る */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(new URL("../../package.json", import.meta.url));
export const { chromium } = require("@playwright/test");

export const BASE = process.env.APP_URL ?? "http://127.0.0.1:3177";
/* CAPTURE_OUT を渡すと、撮ったものと位置の記録をそこへ置く（試し撮りで本番の素材を上書きしない） */
const TRY = process.env.CAPTURE_OUT ? join(process.env.CAPTURE_OUT, "/") : null;
export const OUT = TRY ?? fileURLToPath(new URL("../public/app/", import.meta.url));
export const REGIONS = TRY ? join(TRY, "regions.json") : fileURLToPath(new URL("../src/candidates/regions.json", import.meta.url));
export const TAKE = TRY ? join(TRY, "take.json") : fileURLToPath(new URL("../src/candidates/take.json", import.meta.url));
export const PHONE = { viewport: { width: 412, height: 860 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "ja-JP" };

/* 見た目は全員同じ1つ（内部の名前は retro）。最初にお伝えすることは、撮る人物の分だけ読んだことにする */
export const PEOPLE = ["saeki", "ogawara", "noda", "shiraishi", "fujimoto", "aoki", "kinoshita"];
export async function prepare(context, personId = "saeki") {
  const host = new URL(BASE).hostname;
  await context.addCookies([
    { name: "koekata_theme", value: "retro", domain: host, path: "/" },
    { name: "koekata_person", value: personId, domain: host, path: "/" },
    ...PEOPLE.map((id) => ({ name: `koekata_promise_${id}`, value: "1", domain: host, path: "/" })),
  ]);
}

/* 人物の切り替えは、画面の下の切り替えを使わず cookie で行う（切り替えは折りたたまれているため） */
export async function switchTo(page, personId, path = "/") {
  await prepare(page.context(), personId);
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
}

/* ブラウザの音声認識の代わりに、決めた言葉を少しずつ聞き取ったことにする */
export function fakeSpeech() {
  class FakeRecognition {
    start() { window.fakeRecognition = this; }
    stop() {
      const result = Object.assign([{ transcript: window.fakeSpoken }], { isFinal: true });
      this.onresult?.({ resultIndex: 0, results: [result] });
      this.onend?.();
    }
    abort() { this.onend?.(); }
    interim(text) {
      const result = Object.assign([{ transcript: text }], { isFinal: false });
      this.onresult?.({ resultIndex: 0, results: [result] });
    }
  }
  Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: FakeRecognition, fakeSpoken: "" });
}

/* 話す：真ん中のボタンを押し続け、言葉が増えていき、離すとパートナーへ渡る */
export const mic = (page) => page.locator(".device-mic");
export async function pressMic(page) {
  await mic(page).hover();
  await page.mouse.down();
  await page.getByRole("button", { name: "離すと送る" }).waitFor();
}
export const hearSoFar = (page, text) => page.evaluate((t) => window.fakeRecognition.interim(t), text);
export async function releaseMic(page, spoken) {
  await page.evaluate((t) => { window.fakeSpoken = t; }, spoken);
  await page.mouse.up();
}
export const replies = (page) => page.getByRole("log").locator(".bubble.assistant:not(.waiting)");
export async function waitForReply(page, count) {
  try {
    await page.waitForFunction((n) => document.querySelectorAll(".bubble.assistant:not(.waiting)").length >= n, count, { polling: 200 });
  } catch (error) {
    await page.screenshot({ path: `${OUT}error-reply.png` }).catch(() => {});
    throw error;
  }
}

/* 文字で話す：入力欄に打って Enter */
export async function typeToPartner(page, text) {
  const before = await replies(page).count();
  const input = page.getByLabel("パートナーに書く");
  await input.fill(text);
  await input.press("Enter");
  await waitForReply(page, before + 1);
}

export const deliver = (page) => page.getByRole("button", { name: /とどける/ });

/* カメラが寄る場所：画面上の要素の位置を記録する（レイアウトが変わっても追える） */
export async function boxOf(page, ...locators) {
  const size = page.viewportSize(), boxes = (await Promise.all(locators.map((l) => l.first().boundingBox()))).filter(Boolean);
  if (!boxes.length) return null;
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x))), y = Math.max(0, Math.min(...boxes.map((b) => b.y)));
  const r = Math.min(size.width, Math.max(...boxes.map((b) => b.x + b.width))), u = Math.min(size.height, Math.max(...boxes.map((b) => b.y + b.height)));
  return { x, y, w: r - x, h: u - y };
}

/* 台本のパートナーが「言葉になりそう」と光らせる2つの言葉（何があったか、どうしたか） */
export const STORY = ["今日の授業、急に静かになった瞬間があって", "声を小さくしたら、みんな聞いてくれた"];
