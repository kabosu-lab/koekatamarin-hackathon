/* 実際のアプリを Playwright で操作し、状態ごとの画面を public/app/ に撮る
   ふつうは scripts/recapture.sh から動かす（コミット済みのアプリを台本モードで動かして撮る）
   声はブラウザの音声認識の代わりに、決めた言葉を少しずつ聞き取ったことにする。見た目は今の1つ（レトロ） */
import { mkdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { BASE, OUT, REGIONS, PHONE, STORY, chromium, prepare, switchTo, fakeSpeech, pressMic, hearSoFar, releaseMic, waitForReply, typeToPartner, deliver, boxOf } from "./capture-lib.mjs";

mkdirSync(OUT, { recursive: true });
const HARSH = "隣のクラスの先生は使えない";
const REPLY = "それ、次の授業でやってみます！";

/* 話の時刻を、夜の話に合わせる（撮影用の使い捨ての DB だけ。recapture.sh が場所を渡す） */
function setStoryTime(table, body, hour, minute) {
  const path = process.env.KOEKATA_DB_PATH;
  if (!path) return;
  const at = new Date(); at.setHours(hour, minute, 0, 0);
  const db = new DatabaseSync(path);
  try { db.prepare(`UPDATE ${table} SET created_at = ? WHERE body LIKE ?`).run(at.toISOString(), `%${body}%`); } finally { db.close(); }
}

const regions = {};
async function mark(page, shot, key, ...locators) {
  const box = await boxOf(page, ...locators);
  if (box) (regions[shot] ??= {})[key] = box;
}

/* スマホのタップで出る灰色の一瞬を映さない */
function noTapHighlight() {
  addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "* { -webkit-tap-highlight-color: transparent; }";
    document.head.append(style);
  });
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  const phone = await browser.newContext(PHONE);
  await prepare(phone, "saeki");
  await phone.addInitScript(fakeSpeech);
  await phone.addInitScript(noTapHighlight);
  const p = await phone.newPage();
  const shot = name => p.screenshot({ path: `${OUT}${name}.png` });

  /* 01 押し続けて話す */
  await p.goto(`${BASE}/`);
  await p.locator(".device-mic").waitFor();
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(400);
  await shot("phone-1-idle");
  await mark(p, "phone-1-idle", "main", p.locator(".device-controls"));
  await pressMic(p);
  await shot("phone-2-listening");
  await mark(p, "phone-2-listening", "main", p.locator(".device-input"));
  for (let n = 1; n <= 5; n++) {
    await hearSoFar(p, STORY[0].slice(0, Math.ceil(STORY[0].length * n / 5)));
    await p.waitForTimeout(400); /* 言葉が固まっていく動きを待つ */
    await shot(`phone-3-heard-${n}`);
    await mark(p, `phone-3-heard-${n}`, "main", p.locator(".device-input"));
  }
  await releaseMic(p, STORY[0]);
  await waitForReply(p, 1);
  /* 2つ目の言葉で、パートナーが「言葉になりそう」と光らせる */
  await pressMic(p);
  await hearSoFar(p, STORY[1]);
  await p.waitForTimeout(1200); /* 短く触っただけだと、使い方の案内になる */
  await releaseMic(p, STORY[1]);
  await waitForReply(p, 2);
  await p.locator('.device-side[data-ready="true"]').waitFor();
  await p.waitForTimeout(400);
  await shot("phone-4-replied");
  await mark(p, "phone-4-replied", "main", p.locator(".bubble.user").last(), p.locator(".bubble.assistant").last());
  await mark(p, "phone-4-replied", "send", deliver(p));

  /* 02 言葉にして、本人が確かめて送る */
  await deliver(p).click();
  await p.getByLabel("投稿の文章").waitFor();
  await p.getByLabel("送り先のチャネル").selectOption({ label: "職員室" });
  await p.waitForTimeout(300);
  await shot("phone-5-draft");
  await mark(p, "phone-5-draft", "main", p.getByLabel("投稿の文章"), p.locator(".perception"));
  await p.locator(".preview").scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  await shot("phone-6-preview");
  await mark(p, "phone-6-preview", "main", p.locator(".preview"));
  const send = p.getByRole("button", { name: "本人として送る" });
  await send.scrollIntoViewIfNeeded();
  await p.waitForTimeout(150);
  await shot("phone-7-before-send");
  await mark(p, "phone-7-before-send", "main", p.locator(".preview"), send);
  await mark(p, "phone-7-before-send", "send", send);
  await send.click();
  await p.getByRole("link", { name: "校内チャネルで見る" }).waitFor();
  await p.waitForTimeout(1600);
  await shot("phone-8-burst"); /* 届いた瞬間の動き */
  await p.locator(".send-burst").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(300);
  await shot("phone-8-sent");
  await mark(p, "phone-8-sent", "main", p.getByRole("link", { name: "校内チャネルで見る" }).locator("xpath=.."));

  /* 03 きつい言葉は、受け取られ方を伝えて言い換えを出す */
  const q = await phone.newPage();
  const qshot = name => q.screenshot({ path: `${OUT}${name}.png` });
  await switchTo(q, "ogawara");
  await typeToPartner(q, HARSH);
  await deliver(q).click();
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
  await switchTo(c, "fujimoto");
  for (const line of ["調べ学習の進め方で悩んでいて", "もう煮詰まってきた"]) await typeToPartner(c, line);
  const offer = c.getByRole("region", { name: "人につなぐ提案" });
  await offer.waitFor();
  await offer.evaluate(el => el.scrollIntoView({ block: "center" }));
  await c.waitForTimeout(250);
  await c.screenshot({ path: `${OUT}phone-12-connect.png` });
  await mark(c, "phone-12-connect", "main", offer);

  /* 命や安全に関わるとき：相談室に要点だけ伝え、本人に見せる。話した言葉が映らないよう、知らせの部分へ送る */
  await switchTo(q, "kinoshita");
  const input = q.getByLabel("パートナーに書く");
  await input.fill("親に殴られている");
  await input.press("Enter");
  const card = q.getByRole("region", { name: "相談室に伝えました" });
  await card.waitFor();
  await card.evaluate(el => el.scrollIntoView({ block: "start" }));
  await q.waitForTimeout(250);
  await qshot("phone-11-safety");
  await mark(q, "phone-11-safety", "main", card.getByRole("heading").first(), card.getByText("今すぐ話せるところ"));
  await mark(q, "phone-11-safety", "lines", card.getByText("今すぐ話せるところ"), card.getByText("0120-061-338"));

  /* 04 校内チャネルに届き、同僚から返事が来る */
  setStoryTime("posts", STORY[1], 21, 12);
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: "ja-JP" });
  await prepare(desk, "saeki");
  const d = await desk.newPage();
  await d.goto(`${BASE}/teams?channel=notices`);
  await d.waitForLoadState("networkidle");
  await d.screenshot({ path: `${OUT}teams-notices.png` });
  await mark(d, "teams-notices", "main", d.getByRole("article").nth(0), d.getByRole("article").nth(1));
  await d.goto(`${BASE}/teams?channel=staffroom`);
  await d.waitForLoadState("networkidle");
  const post = d.getByRole("article").filter({ hasText: STORY[1].slice(0, 8) }).first();
  await post.waitFor();
  await post.scrollIntoViewIfNeeded();
  await d.waitForTimeout(150);
  await d.screenshot({ path: `${OUT}teams-1-posted.png` });
  await mark(d, "teams-1-posted", "main", post);
  await switchTo(d, "ogawara", "/teams?channel=staffroom");
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

  /* 05 返事が、話す画面の窓の上に知らせで届く（出なければ飛ばす。受信箱には残る） */
  await switchTo(p, "saeki");
  const toast = p.locator(".lcd").getByText("大河原", { exact: false }).first();
  if (await toast.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
    await p.waitForTimeout(300);
    await shot("phone-13-reply-notice");
    await mark(p, "phone-13-reply-notice", "main", toast);
  } else console.log("返事の知らせは画面に出ませんでした（受信箱では見られます）");
  writeFileSync(REGIONS, JSON.stringify(regions, null, 1) + "\n");
  console.log("撮りました", OUT);
} finally {
  await browser.close();
}
