/* 一日の機能（今日の3人、受信箱、分身、自習室、日報）の実画面を撮る。capture-app.mjs のあとに動かす
   1つの画面で失敗しても、残りは撮って、失敗した名前を最後に知らせる */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const BASE = process.env.APP_URL ?? "http://127.0.0.1:3177";
const OUT = new URL("../public/app/", import.meta.url).pathname;
const REGIONS = new URL("../src/candidates/regions.json", import.meta.url);
const regions = JSON.parse(readFileSync(REGIONS, "utf8"));
const SAEKI = "佐伯 みどり（国語・2年担任）", OKAWARA = "大河原 誠（英語・学年主任）", AOKI = "青木 ひより（2年）", KYOTO = "藤本 恵（教頭）";
const failed = [];

const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "ja-JP" });
  const page = await context.newPage();

  async function switchTo(option) {
    await page.goto(`${BASE}/`);
    await page.getByLabel("使う人").selectOption({ label: option });
    await page.getByRole("button", { name: "切り替え" }).click();
    await page.locator(`.talk[data-viewer="${option.split("（")[0]}"]`).waitFor();
  }
  async function shot(name, ...locators) {
    const first = locators[0]?.first();
    if (first) { await first.evaluate(el => el.scrollIntoView({ block: "center" })); await page.waitForTimeout(250); }
    await page.screenshot({ path: `${OUT}${name}.png` });
    const size = page.viewportSize(), boxes = (await Promise.all(locators.map(l => l.first().boundingBox()))).filter(Boolean);
    if (boxes.length) {
      const x = Math.max(0, Math.min(...boxes.map(b => b.x))), y = Math.max(0, Math.min(...boxes.map(b => b.y)));
      const r = Math.min(size.width, Math.max(...boxes.map(b => b.x + b.width))), u = Math.min(size.height, Math.max(...boxes.map(b => b.y + b.height)));
      regions[name] = { main: { x, y, w: r - x, h: u - y } };
    }
  }
  async function section(name, run) {
    try { await run(); } catch (error) { failed.push(`${name}: ${String(error.message).split("\n")[0]}`); }
  }

  await section("今日の3人", async () => {
    await switchTo(SAEKI);
    await page.goto(`${BASE}/today`);
    await page.locator(".today-card").first().waitFor();
    await shot("feature-today", page.locator(".today-card"));
  });

  await section("受信箱", async () => {
    const asked = "作文の書き出しを、生徒にどう教えていますか？";
    await switchTo(OKAWARA);
    const response = await page.request.post(`${BASE}/api/publish`, { data: { text: asked, channelId: "study", askedPersonId: "saeki" } });
    if (!response.ok()) throw new Error(`publish ${response.status()}`);
    await switchTo(SAEKI);
    await page.goto(`${BASE}/inbox`);
    const card = page.getByRole("region").filter({ hasText: asked }).first();
    await card.waitFor();
    await shot("feature-inbox", card);
    await card.getByLabel("話したこと").fill("私は、最初の一文だけ声に出して読ませています。");
    await card.getByRole("button", { name: "返信の言葉にする" }).click();
    await card.getByLabel("返信の文章").waitFor();
    await shot("feature-inbox-reply", card);
    await card.getByRole("button", { name: "本人として返信する" }).click();
    await page.getByText("ゴール！").first().waitFor();
    await shot("feature-inbox-goal", page.getByText("ゴール！"));
  });

  await section("分身とありがとう", async () => {
    await switchTo(AOKI);
    await page.goto(`${BASE}/me`);
    const form = page.getByRole("region", { name: "サンクスカードを送る" });
    await form.getByLabel("送る相手").selectOption({ label: SAEKI });
    await form.getByLabel("ありがとうの言葉").fill("作文の書き出し、声に出したら書けました。");
    await form.getByRole("button", { name: "サンクスカードを送る" }).click();
    await form.getByText("ありがとうが届きました").waitFor();
    await switchTo(SAEKI);
    await page.goto(`${BASE}/me`);
    const quiz = page.getByRole("region", { name: "最初の問いかけ" });
    if (await quiz.isVisible()) {
      await quiz.getByRole("button", { name: "人物" }).click();
      await quiz.getByRole("button", { name: "じっくり話を聞く" }).click();
      await quiz.waitFor({ state: "detached" });
    }
    const buddy = page.getByRole("region", { name: "相棒", exact: true });
    await buddy.waitFor();
    await buddy.locator("img").first().evaluate(img => img.complete || new Promise(done => { img.onload = done; }));
    await shot("feature-buddy", buddy);
    await shot("feature-thanks", page.getByRole("region", { name: "もらったありがとう" }));
    await page.goto(`${BASE}/minna`);
    await page.getByRole("heading", { name: "みんな" }).waitFor();
    await page.waitForLoadState("networkidle");
    await shot("feature-minna");
    await page.getByRole("link", { name: "春を見る" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}feature-sakura.png` });
    regions["feature-sakura"] = { main: { x: 0, y: 70, w: 412, h: 250 } };
  });

  await section("一緒に勉強", async () => {
    await page.goto(`${BASE}/study/room`);
    const room = page.getByRole("region", { name: "自習室" });
    await room.waitFor();
    await page.waitForLoadState("networkidle");
    await shot("feature-room", room);
  });

  await section("日報", async () => {
    const shared = "作文の書き出しを、声に出して読ませた。";
    await switchTo(SAEKI);
    await page.getByRole("button", { name: "文字で書く" }).click();
    await page.getByLabel("相棒に書く").fill(shared);
    await page.getByRole("button", { name: "相棒に送る" }).click();
    await page.getByRole("log").locator(".bubble.assistant:not(.waiting)").last().waitFor();
    await page.goto(`${BASE}/daily`);
    await page.getByRole("button", { name: "今日の日報を作る" }).click();
    const item = page.getByRole("checkbox", { name: shared });
    await item.waitFor();
    await shot("feature-daily", page.getByRole("checkbox").first(), item);
    await item.click();
    await page.waitForTimeout(400);
    await shot("feature-daily-checked", page.getByRole("checkbox").nth(1), item);
    await switchTo(KYOTO);
    await page.goto(`${BASE}/daily/received`);
    const report = page.getByRole("article").filter({ hasText: shared }).first();
    await report.getByLabel("一言かえす").fill("よく見ていますね。");
    await report.getByRole("button", { name: "一言を送る" }).click();
    await report.locator(".response-card").waitFor();
    await shot("feature-daily-received", report);
  });
} finally {
  await browser.close();
  writeFileSync(REGIONS, JSON.stringify(regions, null, 1) + "\n");
}
if (failed.length) { console.log("撮れなかった画面:\n" + failed.join("\n")); process.exitCode = 1; } else console.log("一日の機能を撮りました");
