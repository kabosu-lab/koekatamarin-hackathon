/* 押し続けて話す→パートナーが返す→光った「とどける」→下書き→確かめる→本人が送る を、切らずに1本の映像で撮る（静止画をつながない）
   ふつうは scripts/recapture.sh から動かす。ブラウザの画面をそのまま記録し、public/app/take.mp4 にする
   カメラが寄る場所と時刻は src/candidates/take.json に残す。時刻はナレーションに合わせた台本どおりに進める */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE, OUT as PUB, TAKE, PHONE, STORY, chromium, prepare, fakeSpeech, mic, hearSoFar, releaseMic, waitForReply, deliver } from "./capture-lib.mjs";

const FPS = 30, END = 36;
mkdirSync(PUB, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), "koekata-take-"));

const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext(PHONE);
  await prepare(context, "saeki");
  await context.addInitScript(fakeSpeech);
  const p = await context.newPage();
  await p.goto(`${BASE}/`);
  const talk = mic(p);
  await talk.waitFor();
  await p.waitForLoadState("networkidle");
  /* スマホのタップで出る灰色の一瞬を映さない */
  await p.addStyleTag({ content: "* { -webkit-tap-highlight-color: transparent; }" });

  const cdp = await context.newCDPSession(p);
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1236, maxHeight: 2580, everyNthFrame: 1 });
  const start = Date.now();
  const elapsed = () => (Date.now() - start) / 1000;
  const until = async s => { const left = s - elapsed(); if (left > 0) await p.waitForTimeout(left * 1000); else if (left < -.25) console.log(`予定より ${(-left).toFixed(2)} 秒遅れ（${s}秒の段）`); };

  /* カメラの段取り：その時点で要素が画面のどこにあるかを記録する */
  const keys = [], taps = [];
  async function look(step, ...locators) {
    const boxes = (await Promise.all(locators.map(l => l.first().boundingBox()))).filter(Boolean);
    const x = Math.max(0, Math.min(...boxes.map(b => b.x))), y = Math.max(0, Math.min(...boxes.map(b => b.y)));
    const r = Math.min(412, Math.max(...boxes.map(b => b.x + b.width))), u = Math.min(860, Math.max(...boxes.map(b => b.y + b.height)));
    keys.push({ at: Math.round(elapsed() * FPS), step, box: { x, y, w: r - x, h: u - y } });
  }
  async function tap(locator) {
    const b = await locator.boundingBox();
    taps.push({ at: Math.round(elapsed() * FPS), x: b.x + b.width / 2, y: b.y + b.height / 2 });
    await locator.tap();
  }
  /* 押し続けて話す：押した場所を記録し、離すまで指を置いたままにする */
  async function press() {
    const b = await talk.boundingBox();
    taps.push({ at: Math.round(elapsed() * FPS), x: b.x + b.width / 2, y: b.y + b.height / 2, hold: true });
    await talk.hover();
    await p.mouse.down();
    await p.getByRole("button", { name: "離すと送る" }).waitFor();
  }
  /* 実際に話す速さで、聞き取った言葉が増えていく */
  async function speak(text, from, seconds) {
    for (let n = 1; n <= text.length; n++) {
      await until(from + seconds * n / text.length);
      await hearSoFar(p, text.slice(0, n));
    }
  }
  /* なめらかにスクロールする（瞬間移動しない） */
  const glide = (locator, seconds) => locator.evaluate((el, ms) => new Promise(done => {
    let box = el.parentElement;
    while (box && !(box.scrollHeight > box.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    box ??= document.scrollingElement;
    const top = box === document.scrollingElement ? 0 : box.getBoundingClientRect().top;
    const from = box.scrollTop, to = Math.max(0, from + el.getBoundingClientRect().top - top - 180), begin = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - begin) / ms), e = k * k * (3 - 2 * k);
      box.scrollTop = from + (to - from) * e;
      if (k < 1) requestAnimationFrame(step); else done();
    })(begin);
  }), seconds * 1000);

  await look(0, p.locator(".device-controls"));
  await until(1.5);
  await press();
  await look(0, p.locator(".device-input"));
  await speak(STORY[0], 2, 4);
  await until(6.6);
  await releaseMic(p, STORY[0]);
  await waitForReply(p, 1);
  await until(7.2);
  await look(1, p.locator(".bubble.user").last(), p.locator(".bubble.assistant").last());

  /* 2つ目の言葉で、パートナーが「言葉になりそう」と光らせる */
  await until(9.6);
  await press();
  await look(0, p.locator(".device-input"));
  await speak(STORY[1], 10, 2.8);
  await until(13.2);
  await releaseMic(p, STORY[1]);
  await waitForReply(p, 2);
  await p.locator('.device-side[data-ready="true"]').waitFor();
  await until(13.6);
  await look(1, p.locator(".bubble.assistant").last(), deliver(p));

  await until(15.5);
  await tap(deliver(p));
  await p.getByLabel("投稿の文章").waitFor();
  await until(16.4);
  await look(1, p.getByLabel("投稿の文章"), p.locator(".perception"));

  /* 送り先を選ぶ */
  await until(20);
  await p.getByLabel("送り先のチャネル").selectOption({ label: "職員室" });

  await until(22.6);
  const preview = p.locator(".preview");
  await glide(preview, 1);
  await look(2, preview);

  await until(29.4);
  const send = p.getByRole("button", { name: "本人として送る" });
  await glide(send, .8);
  await look(3, preview, send);
  await until(33.2);
  await tap(send);
  await p.getByRole("link", { name: "校内チャネルで見る" }).waitFor();
  await until(34.4);
  await look(3, p.getByRole("link", { name: "校内チャネルで見る" }).locator("xpath=.."));
  await until(END + .3);
  await cdp.send("Page.stopScreencast");

  /* 記録はコマの間隔がばらばらなので、時刻どおりに並べて一定の速さの映像にする */
  const t0 = start / 1000, list = [];
  frames.forEach((fr, i) => {
    const from = i ? fr.t : t0, next = frames[i + 1]?.t ?? t0 + END + .3;
    list.push(`file '${fr.file}'`, `duration ${Math.max(.001, next - from).toFixed(4)}`);
  });
  list.push(`file '${frames.at(-1).file}'`);
  const concat = join(dir, "list.txt");
  writeFileSync(concat, list.join("\n"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concat, "-vf", `fps=${FPS},scale=1236:2580,format=yuv420p`, "-c:v", "libx264", "-crf", "14", "-preset", "medium", `${PUB}take.mp4`]);
  writeFileSync(TAKE, JSON.stringify({ size: [412, 860], end: END, keys, taps }, null, 1) + "\n");
  console.log(`切らずに撮りました ${frames.length}コマ（${(frames.at(-1).t - t0).toFixed(1)}秒）`);
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
