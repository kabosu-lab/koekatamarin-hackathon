// デモ用の架空の賞状（画像）と報告書（PDF）を作る。学校も人も架空で、生成物は Git に入らない data/ に置く。
//   npm run demo:attachments
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

export const DEMO_DIR = "data/demo-attachments";
export const DEMO_CERTIFICATE = join(DEMO_DIR, "demo-certificate.png");
export const DEMO_REPORT = join(DEMO_DIR, "demo-report.pdf");

const BASE = `<meta charset="utf-8"><style>body{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;margin:0;color:#222}</style>`;

const CERTIFICATE = `${BASE}
<div style="box-sizing:border-box;width:1000px;height:707px;padding:60px;border:14px double #b8860b;text-align:center;background:#fffdf5">
  <h1 style="font-size:64px;letter-spacing:.5em;margin:10px 0 40px">賞状</h1>
  <p style="font-size:30px;text-align:left;margin:0 40px 30px">青木 ひより 殿</p>
  <p style="font-size:30px;line-height:1.9;margin:0 40px">あなたは、校内ロボットコンテスト（架空）において、<br>三回の失敗を乗り越えてアームを動かし、<br>準優勝の成績を収めました。ここに賞します。</p>
  <p style="font-size:26px;margin-top:50px">令和八年十月三十日</p>
  <p style="font-size:30px">こえかた学校（架空） 校長 架空 太郎</p>
</div>`;

const REPORT = `${BASE}
<div style="padding:50px;font-size:18px;line-height:1.9">
  <h1 style="font-size:30px">探究活動の報告書（架空）</h1>
  <p>テーマ：図書室のしおり立てを 3D プリンターで作る</p>
  <p>報告者：木下 蓮（こえかた学校（架空））　連絡先：000-0000-0000</p>
  <h2 style="font-size:22px">やったこと</h2>
  <p>底の広さを 3 通り試作し、倒れにくさを比べた。底を 1.5 倍に広げると倒れなくなったが、反りが出た。</p>
  <h2 style="font-size:22px">わかったこと</h2>
  <p>印刷の向きを変えると反りが減った。図書室の先生に使ってもらい、高さへの意見をもらった。</p>
  <h2 style="font-size:22px">次にやること</h2>
  <p>国語の教室の分も作り、使った人の感想を集める。</p>
</div>`;

export async function makeDemoAttachments(): Promise<void> {
  mkdirSync(DEMO_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 707 } });
    await page.setContent(CERTIFICATE);
    await page.screenshot({ path: DEMO_CERTIFICATE });
    await page.setContent(REPORT);
    await page.pdf({ path: DEMO_REPORT, format: "A4" });
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  makeDemoAttachments()
    .then(() => console.log(`${DEMO_CERTIFICATE} と ${DEMO_REPORT} を作りました`))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
