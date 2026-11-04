// 本物の Claude で、ダミーの写真から分身を描いて、コードの絵と見比べる。料金がかかるので、テストからは呼ばない。
//   npm run try:avatar -- <出力する PNG のパス>
import { chromium } from "@playwright/test";
import { drawWithClaude } from "../src/lib/avatar-art";
import { drawWithCode, POSES, toSvg, traitsFromSeed, type AvatarTraits, type Drawing } from "../src/lib/avatar-draw";
import { createClaude } from "../src/lib/claude/index";
import { drawFrappe, drawLaptop } from "../src/lib/profile-photo/dummy";

const cases = [
  { name: "フラペチーノ風", draw: drawFrappe, note: "架空の人が登録した、クリームの乗った飲み物の画像です。" },
  { name: "ノートパソコン風", draw: drawLaptop, note: "架空の人が登録した、銀色のノートパソコンの画像です。" },
];

const dataUrl = (type: string, bytes: Uint8Array | string) => `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;

function row(title: string, photo: Uint8Array | null, drawing: Drawing, background: string): string {
  const cells = POSES.map((pose) => `<img src="${dataUrl("image/svg+xml", toSvg(drawing.body, drawing.poses[pose]))}" width="170" height="170">`);
  const image = photo ? `<img src="${dataUrl("image/png", photo)}" width="120" height="120">` : `<div style="width:120px"></div>`;
  return `<div style="display:flex;align-items:center;gap:8px;background:${background};padding:6px"><div style="width:110px;font:14px sans-serif">${title}</div>${image}${cells.join("")}</div>`;
}

async function main() {
  const output = process.argv[2];
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  const rows: string[] = [];
  for (const { name, draw, note } of cases) {
    const photo = draw();
    const started = Date.now();
    const result = await drawWithClaude(claude, 2, { attachment: { mediaType: "image/png", base64: Buffer.from(photo).toString("base64") }, note });
    console.log(`\n${name}：${Math.round((Date.now() - started) / 1000)} 秒`);
    if (!result) {
      console.log("描けないか、安全の確認で捨てました");
      continue;
    }
    const size = JSON.stringify(result.drawing).length;
    console.log("読み取り：", result.traits, `SVG ${size} 文字`);
    rows.push(row(`Claude ${name}`, photo, result.drawing, "#ffffff"));
    const traits: AvatarTraits = result.traits;
    rows.push(row(`コード ${name}`, null, drawWithCode(traits, 2), "#f4f4f8"));
  }
  rows.push(row("コード 色のみ", null, drawWithCode(traitsFromSeed("sample"), 2), "#f4f4f8"));

  if (output) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1180, height: 200 } });
    await page.setContent(`<body style="margin:0">${rows.join("")}</body>`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: output, fullPage: true });
    await browser.close();
    console.log(`\n一覧：${output}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
