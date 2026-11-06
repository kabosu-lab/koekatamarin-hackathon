/* 一日の機能（今日の3人、受信箱、パートナー、自習室、日報など）の実画面を撮る。capture-app.mjs のあとに動かす
   1つの画面で失敗しても、残りは撮って、失敗した名前を最後に知らせる。見た目は今の1つ（レトロ） */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { BASE, OUT, REGIONS, PHONE, chromium, prepare, switchTo, typeToPartner, deliver, boxOf } from "./capture-lib.mjs";

const regions = existsSync(REGIONS) ? JSON.parse(readFileSync(REGIONS, "utf8")) : {};
const failed = [];

const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext(PHONE);
  await prepare(context, "saeki");
  const page = await context.newPage();

  async function shot(name, ...locators) {
    const first = locators[0]?.first();
    if (first) { await first.evaluate(el => el.scrollIntoView({ block: "center" })); await page.waitForTimeout(250); }
    await page.screenshot({ path: `${OUT}${name}.png` });
    const box = await boxOf(page, ...locators);
    if (box) regions[name] = { main: box };
  }
  async function section(name, run) {
    try { await run(); } catch (error) { failed.push(`${name}: ${String(error.message).split("\n")[0]}`); }
  }
  /* トロフィーが届いた知らせは、ひと押しで閉じる（撮る画面に重ねない） */
  async function closeMoments() {
    const moment = page.locator(".ribbon-moment");
    for (let i = 0; i < 5 && await moment.first().isVisible().catch(() => false); i++) {
      await moment.first().click();
      await page.waitForTimeout(300);
    }
  }
  const imageLoaded = (locator) => locator.evaluate(img => img.complete || new Promise(done => { img.onload = done; }));

  await section("今日の3人", async () => {
    await switchTo(page, "saeki", "/today");
    await page.locator(".today-card").first().waitFor();
    await shot("feature-today", page.locator(".today-card"));
  });

  await section("受信箱", async () => {
    const asked = "作文の書き出しを、生徒にどう教えていますか？";
    await switchTo(page, "ogawara");
    const response = await page.request.post(`${BASE}/api/publish`, { data: { text: asked, channelId: "study", askedPersonId: "saeki" } });
    if (!response.ok()) throw new Error(`publish ${response.status()}`);
    await switchTo(page, "saeki", "/inbox");
    const card = page.getByRole("region").filter({ hasText: asked }).first();
    await card.waitFor();
    await shot("feature-inbox", card);
    await card.getByLabel("話したこと").fill("私は、最初の一文だけ声に出して読ませています。");
    await card.getByRole("button", { name: "文章にする" }).click();
    await card.getByLabel("返信の文章").waitFor();
    await shot("feature-inbox-reply", card);
    await card.getByRole("button", { name: "本人として返信する" }).click();
    await page.getByText("解決！").first().waitFor();
    await shot("feature-inbox-goal", page.getByText("解決！"));
  });

  await section("パートナーとありがとう", async () => {
    await switchTo(page, "aoki", "/me");
    const form = page.getByRole("region", { name: "サンクスカードを送る" });
    await form.getByLabel("送る相手").selectOption({ label: "佐伯 みどり（国語・2年担任）" });
    await form.getByLabel("ありがとうの言葉").fill("作文の書き出し、声に出したら書けました。");
    await form.getByRole("button", { name: "サンクスカードを送る" }).click();
    await form.getByText("ありがとうが届きました").waitFor();
    await switchTo(page, "saeki", "/me");
    const quiz = page.getByRole("region", { name: "最初の問いかけ" });
    if (await quiz.isVisible()) {
      await quiz.getByRole("button", { name: "人物" }).click();
      await quiz.getByRole("button", { name: "じっくり話を聞く" }).click();
      await quiz.waitFor({ state: "detached" });
    }
    /* 「履歴と設定」の上の窓：パートナーと、頑張りたいこと */
    await page.locator(".me-screen").waitFor();
    await page.waitForTimeout(800);
    await closeMoments();
    await page.evaluate(() => { scrollTo(0, 0); document.querySelectorAll(".device-body").forEach((el) => { el.scrollTop = 0; }); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}feature-me.png` });
    regions["feature-me"] = { main: await boxOf(page, page.locator(".me-screen"), page.getByRole("region", { name: "頑張りたいこと" })) };
    const partner = page.getByRole("region", { name: "パートナー", exact: true });
    await partner.waitFor();
    await imageLoaded(partner.locator("img").first());
    await shot("feature-buddy", partner);
    await shot("feature-thanks", page.getByRole("region", { name: "もらったありがとう" }));
    await page.goto(`${BASE}/minna`);
    await page.getByRole("heading", { name: "みんな" }).waitFor();
    await page.waitForLoadState("networkidle");
    await shot("feature-minna");
    await page.getByRole("link", { name: "桜の木を大きく見る" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}feature-sakura.png` });
    regions["feature-sakura"] = { main: { x: 0, y: 70, w: 412, h: 250 } };
  });

  await section("一緒に勉強", async () => {
    await page.goto(`${BASE}/study/room`);
    const room = page.getByRole("region", { name: "自習室" }).first();
    await room.waitFor();
    await page.waitForLoadState("networkidle");
    await shot("feature-room", room);
  });

  await section("日報", async () => {
    const shared = "作文の書き出しを、声に出して読ませた。";
    await switchTo(page, "saeki");
    await typeToPartner(page, shared);
    await page.goto(`${BASE}/daily`);
    await page.getByRole("button", { name: "今日の日報を作る" }).click();
    const item = page.getByRole("checkbox", { name: shared });
    await item.waitFor();
    await shot("feature-daily", page.getByRole("checkbox").first(), item);
    await item.click();
    await page.waitForTimeout(400);
    await shot("feature-daily-checked", page.getByRole("checkbox").nth(1), item);
    await switchTo(page, "fujimoto", "/daily/received");
    const report = page.getByRole("article").filter({ hasText: shared }).first();
    await report.getByLabel("一言かえす").fill("よく見ていますね。");
    await report.getByRole("button", { name: "一言を送る" }).click();
    await report.locator(".response-card").waitFor();
    await shot("feature-daily-received", report);
  });

  await section("校内の知恵", async () => {
    await switchTo(page, "aoki", "/chie");
    await page.getByRole("link", { name: "出張の出し方" }).waitFor();
    await page.waitForTimeout(700); /* 画面が出そろうのを待つ */
    await shot("feature-chie");
    await page.getByLabel("やりたいこと、困っていること").fill("出張の出し方を知りたい");
    await page.getByRole("button", { name: "校内の知恵を探す" }).click();
    const result = page.locator(".chie-results li").first();
    await result.waitFor();
    await shot("feature-chie-find", result);
    await page.goto(`${BASE}/chie/knowledge-quick-quiz`);
    await page.getByLabel("注釈を書く").waitFor();
    await shot("feature-chie-detail", page.getByLabel("注釈を書く"));
  });

  await section("添付", async () => {
    if (!process.env.DEMO_CERTIFICATE) throw new Error("DEMO_CERTIFICATE がない（recapture.sh が作る）");
    await switchTo(page, "aoki");
    await page.locator('.device-side input[type="file"]').setInputFiles(process.env.DEMO_CERTIFICATE);
    await page.getByRole("region", { name: "付けたファイル" }).waitFor();
    await typeToPartner(page, "校内ロボットコンテストで準優勝しました！");
    await deliver(page).click();
    const check = page.getByRole("group", { name: "添付の確認" });
    await check.waitFor();
    await page.waitForTimeout(300);
    await shot("feature-attach", check);
  });

  await section("報酬", async () => {
    await switchTo(page, "ogawara", "/me");
    const trophies = page.getByRole("region", { name: "トロフィー" });
    await trophies.waitFor();
    await shot("feature-ribbon", trophies);
    await switchTo(page, "noda", "/me");
    await page.getByRole("region", { name: "贈り物の卵" }).getByRole("button", { name: "開ける" }).first().click();
    const stage = page.getByRole("dialog", { name: "贈り物の卵" });
    await stage.getByRole("heading", { name: /が生まれた！/ }).waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}feature-egg.png` });
    await page.goto(`${BASE}/minna`);
    const event = page.getByRole("region", { name: "期間限定のイベント" }).first();
    await event.waitFor();
    await shot("feature-event", event);
    await switchTo(page, "shiraishi", "/me"); /* 今の段階を起点にする */
    await page.getByRole("region", { name: "パートナー", exact: true }).locator("img").first().waitFor();
    await switchTo(page, "aoki");
    for (let i = 0; i < 12; i++) await page.request.post(`${BASE}/api/thanks`, { data: { toPersonId: "shiraishi", message: `助かりました ${i}` } });
    await switchTo(page, "shiraishi", "/me");
    const card = page.getByRole("region", { name: "進化", exact: true });
    await card.getByRole("button", { name: "進化の候補を見る" }).click();
    await card.locator(".evolve-choices button").first().waitFor();
    await page.waitForTimeout(400);
    await shot("feature-evolve", card);
  });

  await section("パートナーの絵", async () => {
    await switchTo(page, "saeki", "/me");
    const art = page.locator(".avatar-image").first();
    await art.waitFor();
    await imageLoaded(art);
    await art.screenshot({ path: `${OUT}avatar.png`, omitBackground: true });
  });
} finally {
  await browser.close();
  writeFileSync(REGIONS, JSON.stringify(regions, null, 1) + "\n");
}
if (failed.length) { console.log("撮れなかった画面:\n" + failed.join("\n")); process.exitCode = 1; } else console.log("一日の機能を撮りました");
