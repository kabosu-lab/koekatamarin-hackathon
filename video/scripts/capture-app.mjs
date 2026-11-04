/* 実際のアプリを Playwright で操作し、状態ごとの画面を public/app/ に撮る
   ふつうは scripts/recapture.sh から動かす（コミット済みのアプリを台本モードで動かして撮る）
   声はブラウザの音声認識の代わりに、決めた言葉を少しずつ聞き取ったことにする */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const BASE = process.env.APP_URL ?? "http://127.0.0.1:3177";
const OUT = new URL("../public/app/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const SPOKEN = "作文の書き出し、声に出して読ませてみたら、みんな書けました！";
const HARSH = "隣のクラスの先生は使えない";
const REPLY = "それ、次の授業でやってみます！";

/* 話の時刻を、夜の話に合わせる（撮影用の使い捨ての DB だけ。recapture.sh が場所を渡す） */
function setStoryTime(table, body, hour, minute) {
  const path = process.env.KOEKATA_DB_PATH;
  if (!path) return;
  const at = new Date(); at.setHours(hour, minute, 0, 0);
  const db = new DatabaseSync(path);
  try { db.prepare(`UPDATE ${table} SET created_at = ? WHERE body = ?`).run(at.toISOString(), body); } finally { db.close(); }
}

/* カメラが寄る場所：画面上の要素の位置を記録する（レイアウトが変わっても追える） */
const regions = {};
async function mark(page, shot, key, ...locators) {
  const size = page.viewportSize(), boxes = (await Promise.all(locators.map(l => l.first().boundingBox()))).filter(Boolean);
  if (!boxes.length) return;
  const x = Math.max(0, Math.min(...boxes.map(b => b.x))), y = Math.max(0, Math.min(...boxes.map(b => b.y)));
  const r = Math.min(size.width, Math.max(...boxes.map(b => b.x + b.width))), u = Math.min(size.height, Math.max(...boxes.map(b => b.y + b.height)));
  (regions[shot] ??= {})[key] = { x, y, w: r - x, h: u - y };
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  const phone = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "ja-JP" });
  await phone.addCookies([{ name: "koekata_theme", value: "pop", url: BASE }]); /* 動画はポップで撮る */
  const p = await phone.newPage();
  const shot = name => p.screenshot({ path: `${OUT}${name}.png` });
  await p.addInitScript(() => {
    class FakeRecognition {
      start() { window.fakeRecognition = this; }
      stop() {
        const result = Object.assign([{ transcript: window.fakeSpoken }], { isFinal: true });
        this.onresult?.({ resultIndex: 0, results: [result] });
        this.onend?.();
      }
      interim(text) {
        const result = Object.assign([{ transcript: text }], { isFinal: false });
        this.onresult?.({ resultIndex: 0, results: [result] });
      }
    }
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: FakeRecognition, fakeSpoken: "" });
  });

  /* 01 話しかける */
  await p.goto(`${BASE}/`);
  await p.getByRole("button", { name: "話しかける" }).waitFor();
  await p.waitForTimeout(400);
  await shot("phone-1-idle");
  await mark(p, "phone-1-idle", "main", p.locator(".actions"));
  await p.getByRole("button", { name: "話しかける" }).click();
  await p.getByText("聞いています…").waitFor();
  await shot("phone-2-listening");
  await mark(p, "phone-2-listening", "main", p.locator(".bubble.listening"));
  for (let n = 1; n <= 5; n++) {
    await p.evaluate(t => window.fakeRecognition.interim(t), SPOKEN.slice(0, Math.ceil(SPOKEN.length * n / 5)));
    await p.waitForTimeout(80);
    await shot(`phone-3-heard-${n}`);
    await mark(p, `phone-3-heard-${n}`, "main", p.locator(".bubble.listening"));
  }
  await p.evaluate(t => { window.fakeSpoken = t; }, SPOKEN);
  await p.getByRole("button", { name: "話し終わった" }).click();
  await p.getByRole("log").locator(".bubble.assistant:not(.waiting)").last().waitFor();
  await p.waitForTimeout(200);
  await shot("phone-4-replied");
  await mark(p, "phone-4-replied", "main", p.locator(".bubble.user").last(), p.locator(".bubble.assistant").last());
  await mark(p, "phone-4-replied", "send", p.getByRole("button", { name: "言葉にして送る" }));

  /* 02 言葉にして、本人が送る */
  await p.getByRole("button", { name: "言葉にして送る" }).click();
  await p.getByLabel("投稿の文章").waitFor();
  await p.getByLabel("送り先のチャネル").selectOption({ label: "職員室" });
  await p.waitForTimeout(300);
  await shot("phone-5-draft");
  await mark(p, "phone-5-draft", "main", p.getByLabel("投稿の文章"), p.locator(".perception"));
  await p.locator(".preview").scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  await shot("phone-6-preview");
  await mark(p, "phone-6-preview", "main", p.locator(".preview"));
  await p.getByRole("button", { name: "本人として送る" }).scrollIntoViewIfNeeded();
  await p.waitForTimeout(150);
  await shot("phone-7-before-send");
  await mark(p, "phone-7-before-send", "main", p.locator(".preview"), p.getByRole("button", { name: "本人として送る" }));
  await mark(p, "phone-7-before-send", "send", p.getByRole("button", { name: "本人として送る" }));
  await p.getByRole("button", { name: "本人として送る" }).click();
  await p.getByRole("link", { name: "校内チャネルで見る" }).waitFor();
  await p.waitForTimeout(1600); /* 送るときの動きが終わるのを待つ */
  await shot("phone-8-sent");
  await mark(p, "phone-8-sent", "main", p.getByRole("link", { name: "校内チャネルで見る" }).locator("xpath=.."));

  /* 03 きつい言葉は、受け取られ方を伝えて言い換えを出す */
  const q = await phone.newPage();
  const qshot = name => q.screenshot({ path: `${OUT}${name}.png` });
  await q.goto(`${BASE}/`);
  await q.getByRole("button", { name: "文字で書く" }).click();
  await q.getByLabel("相棒に書く").fill(HARSH);
  await q.getByRole("button", { name: "相棒に送る" }).click();
  await q.getByRole("log").locator(".bubble.assistant:not(.waiting)").last().waitFor();
  await q.getByRole("button", { name: "言葉にして送る" }).click();
  await q.locator(".perception").waitFor();
  await q.waitForTimeout(300);
  await q.locator(".perception").scrollIntoViewIfNeeded();
  await qshot("phone-9-caution");
  await mark(q, "phone-9-caution", "main", q.getByLabel("投稿の文章"), q.locator(".perception"));
  await q.getByRole("button", { name: /この言い方にする/ }).click();
  await q.getByLabel("投稿の文章").scrollIntoViewIfNeeded();
  await q.waitForTimeout(300);
  await qshot("phone-10-rephrased");
  await mark(q, "phone-10-rephrased", "main", q.getByLabel("投稿の文章"), q.locator(".perception"));

  /* 人につなぐ：煮詰まったときだけ、人を紹介する */
  const c = await phone.newPage();
  await c.goto(`${BASE}/`);
  await c.getByRole("button", { name: "文字で書く" }).click();
  for (const line of ["調べ学習の進め方で悩んでいて", "もう煮詰まってきた"]) {
    const count = await c.getByRole("log").locator(".bubble.assistant").count();
    await c.getByLabel("相棒に書く").fill(line);
    await c.getByRole("button", { name: "相棒に送る" }).click();
    await c.waitForFunction(n => document.querySelectorAll(".bubble.assistant:not(.waiting)").length > n, count);
  }
  const offer = c.getByRole("region", { name: "人につなぐ提案" });
  await offer.waitFor();
  await offer.evaluate(el => el.scrollIntoView({ block: "center" }));
  await c.waitForTimeout(250);
  await c.screenshot({ path: `${OUT}phone-12-connect.png` });
  await mark(c, "phone-12-connect", "main", offer);

  /* 命や安全に関わるとき：相談室に要点だけ伝え、本人に見せる。話した言葉が映らないよう、知らせの部分へ送る */
  await q.goto(`${BASE}/`);
  await q.getByLabel("使う人").selectOption({ label: "木下 蓮（3年・ものづくり部）" });
  await q.getByRole("button", { name: "切り替え" }).click();
  await q.waitForLoadState("networkidle");
  await q.getByRole("button", { name: "文字で書く" }).click();
  await q.getByLabel("相棒に書く").fill("親に殴られている");
  await q.getByRole("button", { name: "相棒に送る" }).click();
  const card = q.getByRole("region", { name: "相談室に伝えました" });
  await card.waitFor();
  await card.evaluate(el => el.scrollIntoView({ block: "start" }));
  await q.waitForTimeout(250);
  await qshot("phone-11-safety");
  await mark(q, "phone-11-safety", "main", card.getByRole("heading").first(), card.getByText("今すぐ話せるところ"));
  await mark(q, "phone-11-safety", "lines", card.getByText("今すぐ話せるところ"), card.getByText("0120-061-338"));

  /* 04 校内チャネルに届き、同僚から返事が来る */
  setStoryTime("posts", SPOKEN, 21, 12);
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: "ja-JP" });
  await desk.addCookies([{ name: "koekata_theme", value: "pop", url: BASE }]);
  const d = await desk.newPage();
  await d.goto(`${BASE}/teams?channel=notices`);
  await d.waitForLoadState("networkidle");
  await d.screenshot({ path: `${OUT}teams-notices.png` });
  await mark(d, "teams-notices", "main", d.getByRole("article").nth(0), d.getByRole("article").nth(1));
  await d.goto(`${BASE}/teams?channel=staffroom`);
  await d.waitForLoadState("networkidle");
  const post = d.getByRole("article").filter({ hasText: SPOKEN.slice(0, 10) }).first();
  await post.waitFor();
  await post.scrollIntoViewIfNeeded();
  await d.waitForTimeout(150);
  await d.screenshot({ path: `${OUT}teams-1-posted.png` });
  await mark(d, "teams-1-posted", "main", post);
  await d.getByLabel("使う人").selectOption({ label: "大河原 誠（英語・学年主任）" });
  await d.getByRole("button", { name: "切り替え" }).click();
  await d.waitForLoadState("networkidle");
  await post.waitFor();
  await post.getByLabel("返信").fill(REPLY);
  await post.getByRole("button", { name: "返信", exact: true }).click();
  await post.locator(".reply").filter({ hasText: REPLY }).waitFor();
  setStoryTime("replies", REPLY, 21, 24);
  await d.reload();
  await d.waitForLoadState("networkidle");
  await post.scrollIntoViewIfNeeded();
  await d.waitForTimeout(150);
  await d.screenshot({ path: `${OUT}teams-2-replied.png` });
  await mark(d, "teams-2-replied", "main", post);
  writeFileSync(new URL("../src/candidates/regions.json", import.meta.url), JSON.stringify(regions, null, 1) + "\n");
  console.log("撮りました", OUT);
} finally {
  await browser.close();
}
