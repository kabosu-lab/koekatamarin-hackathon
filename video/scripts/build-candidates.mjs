/* 候補 A〜D の音と絵を用意する。音はすべてコードで作り、絵は Codex で作ったものを .private/art から使う
   （絵は、使ってよいと確認が取れるまで公開しない。public/ は Git に入らない） */
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mix, pad, pen, piano, reverb, save, tick } from "./audio-lib.mjs";
import { copyArt, hasSay, noteSkippedVoice } from "./asset-tools.mjs";

const pub = new URL("../public/", import.meta.url);
const cand = new URL("../src/candidates/lines.json", import.meta.url);
const LINES = JSON.parse(readFileSync(cand, "utf8"));
mkdirSync(pub, { recursive: true });

for (const name of ["night-staffroom.png", "morning-corridor.png", "letter-paper.png"]) {
  copyArt(new URL(`../../.private/art/video/${name}`, import.meta.url), new URL(name, pub));
}
copyArt(new URL("../../.private/art/school-haru.jpg", import.meta.url), new URL("school.jpg", pub));

/* A：間の多いピアノ。夜は低く、朝で明るくなる */
{
  const m = mix();
  [[.6, 57], [2.2, 64], [3.8, 60], [5.4, 53], [7, 60]].forEach(([t, n]) => piano(m, t, n, .2, { pan: (n - 59) * .03 }));
  pad(m, 0, [45, 52], 8.4, .02);
  [[8.4, 48], [8.4, 60], [8.9, 64], [9.4, 67], [10.2, 72]].forEach(([t, n]) => piano(m, t, n, .2));
  pad(m, 8.2, [48, 55, 64], 6.8, .022);
  [[11.8, 53], [11.8, 69], [12.3, 72], [12.8, 76]].forEach(([t, n]) => piano(m, t, n, .19));
  reverb(m, .34); save(m, "music-a.wav");
}
/* B：画面の操作に合わせた小さな音だけ。音楽は薄く */
{
  const m = mix();
  pad(m, 0, [48, 55, 64], 7.6, .018); pad(m, 7.4, [53, 60, 69], 7.6, .018);
  [[3.6, 72], [4.0, 74], [6.2, 76], [7.5, 79], [9.0, 79], [10.8, 84]].forEach(([t, n]) => tick(m, t, n));
  [[12.4, 48], [12.4, 67], [12.8, 72], [13.2, 76]].forEach(([t, n]) => piano(m, t, n, .16));
  reverb(m, .22); save(m, "music-b.wav", .6);
}
/* C：ペンの音と、返事が届くところのピアノ */
{
  const m = mix();
  for (const l of LINES.c) pen(m, l.at / 30, l.text.length * l.pace / 30, l.reply ? .035 : .045);
  [[1, 57], [4.4, 53], [7.4, 60]].forEach(([t, n]) => piano(m, t, n, .13));
  [[8.6, 60], [9, 64], [9.4, 67], [9.8, 72]].forEach(([t, n]) => piano(m, t, n, .16));
  [[12.4, 53], [12.4, 69], [12.8, 72], [13.2, 76]].forEach(([t, n]) => piano(m, t, n, .16));
  reverb(m, .3); save(m, "music-c.wav", .62);
}
/* D：今の15秒の和音と速さを残し、太鼓と跳ねる音を抑える */
{
  const m = mix();
  const chords = { Am: [45, 57, 60, 64], F: [41, 53, 60, 65], C: [48, 60, 64, 67], G: [43, 55, 62, 67] };
  ["Am", "Am", "F", "Am", "C", "G", "F", "C"].forEach((name, b) => {
    const c = chords[name], at = b * 2;
    if (at >= 15) return;
    pad(m, at, [c[0], c[0] + 12], 2.1, .022);
    for (let k = 0; k < 4; k++) piano(m, at + k * .5, c[1 + (k + b) % 3] + (b >= 4 ? 12 : 0), b >= 4 ? .11 : .09, { dur: 1.6, pan: k % 2 ? .35 : -.35 });
  });
  [[12.8, 72], [13.1, 76], [13.4, 79]].forEach(([t, n]) => piano(m, t, n, .14));
  reverb(m, .3); save(m, "music-d.wav", .55);
}

/* 仮の声（Mac の Kyoko）。本番は作り手の声に替える */
if (!hasSay()) noteSkippedVoice(LINES.voice.length);
else for (const v of LINES.voice) {
  const aiff = new URL(`${v.id}.aiff`, pub).pathname, out = new URL(`${v.id}.wav`, pub).pathname;
  execFileSync("say", ["-v", "Kyoko", "-r", String(v.rate ?? 170), "-o", aiff, v.text]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "44100", "-ac", "2", out]);
  rmSync(aiff);
  const len = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
  console.log(`${v.id} ${len.toFixed(2)}秒 ${(v.at / 30).toFixed(2)}〜${(v.at / 30 + len).toFixed(2)} ${v.text}`);
}
console.log("候補の音と絵を用意しました");
