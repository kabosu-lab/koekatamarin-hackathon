/* 全編の音楽と効果音を、拍の表（timeline.json）から作る。120 BPM、4拍子、ハ長調。素材ファイルなし
   音の数を少なくし、ベースとドラムをはっきりさせる。高い音のきらきらは控えめ */
import { readFileSync } from "node:fs";
import { SR, add, hz, mix, piano, reverb, save } from "./audio-lib.mjs";
const TL = JSON.parse(readFileSync(new URL("../src/candidates/timeline.json", import.meta.url), "utf8")), B = .5, BAR = TL.barSec, SEC = TL.bars * BAR + 3, pub = new URL("../public/", import.meta.url);
const scenes = TL.scenes.filter(s => !s.wait);
function pop(m, at, note, vol = .5, pan = 0) { const s = Math.floor(at * SR), len = Math.floor(.22 * SR), f0 = hz(note); for (let i = 0; i < len; i++) { const t = i / SR, idx = 2.4 * Math.exp(-t * 34), bend = 1 + .12 * Math.exp(-t * 90); add(m, s + i, Math.sin(2 * Math.PI * f0 * bend * t + idx * Math.sin(2 * Math.PI * f0 * 3.5 * t)) * Math.exp(-t * 19) * Math.min(1, i / 40) * vol, pan); } }
let seed = 5; const noise = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
function whoosh(m, at, dur, vol = .8) { const s = Math.floor(at * SR), len = Math.floor(dur * SR); let y1 = 0, y2 = 0; for (let i = 0; i < len; i++) { const k = i / len, w = 2 * Math.PI * (500 + 5200 * k * k) / SR, q = .96, a1 = -2 * q * Math.cos(w), a2 = q * q, y = noise() * .09 - a1 * y1 - a2 * y2; y2 = y1; y1 = y; add(m, s + i, y * Math.sin(Math.PI * k) ** 1.2 * vol, -.8 + 1.6 * k); } }
function kick(m, at, vol = .6) { const s = Math.floor(at * SR), len = Math.floor(.2 * SR); let ph = 0; for (let i = 0; i < len; i++) { const t = i / SR; ph += 2 * Math.PI * (48 + 110 * Math.exp(-t * 38)) / SR; add(m, s + i, Math.sin(ph) * Math.exp(-t * 15) * vol); } }
function hiss(m, at, dur, decay, vol, pan = 0) { const s = Math.floor(at * SR), len = Math.floor(dur * SR); let last = 0; for (let i = 0; i < len; i++) { const t = i / SR, n = noise(), hp = n - last; last = n; add(m, s + i, hp * Math.exp(-t * decay) * vol, pan); } }
function bass(m, at, note, dur, vol = .4, bright = .5) { const s = Math.floor(at * SR), len = Math.floor(dur * SR), f0 = hz(note); for (let i = 0; i < len; i++) { const t = i / SR, v = Math.sin(2 * Math.PI * f0 * t) + bright * Math.sin(4 * Math.PI * f0 * t) * Math.exp(-t * 7) + bright * .4 * Math.sin(6 * Math.PI * f0 * t) * Math.exp(-t * 12); add(m, s + i, v * Math.exp(-t * 3.2) * Math.min(1, i / 70) * Math.min(1, (len - i) / 300) * vol); } }
const barsOf = st => { const l = scenes.filter(s => s.stage === st); return l.length ? l[0].bar : 1e9; };
const b1 = barsOf("話す"), b2 = barsOf("つながる"), b3 = barsOf("たまる"), b4 = barsOf("増える"), b5 = barsOf("広がる"), bC = barsOf("Claude"), bE = scenes.find(s => s.engine === "end").bar;
{ const m = mix(SEC), A = [[48, 55, 64, 67], [53, 60, 64, 69], [45, 52, 60, 67], [55, 62, 65, 71]], X = [[45, 52, 60, 67], [53, 60, 64, 69], [48, 55, 64, 67], [55, 62, 65, 71]];
  for (let bar = 0; bar < bE; bar++) { const t0 = bar * BAR, part = bar >= b3 && bar < b5 ? X : A, c = part[bar % 4], lvl = bar < b1 ? .55 : bar < b2 ? .8 : 1;
    for (let i = 0; i < 4; i++) { const t = t0 + i * B;
      if (bar >= 4) kick(m, t, .55);
      if (bar >= 4 && i % 2) hiss(m, t, .16, 26, .42);
      if (bar >= 2) hiss(m, t + B / 2, .05, 80, .12 * lvl, .3);
    }
    bass(m, t0, c[0] - 12, .3, .42 * lvl); bass(m, t0 + .75, c[0] - 12, .2, .34 * lvl); bass(m, t0 + 1.25, c[0], .2, .32 * lvl); bass(m, t0 + 1.75, c[1] - 12, .2, .32 * lvl);
    if (bar >= b2) [1, 3].forEach(i => c.slice(1).forEach((n, k) => pop(m, t0 + i * B + B / 2, n + 12, .14, -.3 + k * .3)));
    if (bar === bC) kick(m, t0, .8);
  }
  [b1, b2, b3, b4, b5, bC].forEach(bar => { kick(m, bar * BAR, .8); hiss(m, bar * BAR, .4, 8, .22); });
  const E = bE * BAR; kick(m, E, .85); [48, 55, 64, 72, 79].forEach(n => piano(m, E, n, .32, { dur: 5 })); [48, 60, 64, 67, 72].forEach(n => piano(m, E + 4, n, .3, { dur: 6 }));
  reverb(m, .12); save(m, "full-music.wav", .55, pub);
}
{ const m = mix(SEC), openSec = scenes.find(s => s.engine === "open").bar * BAR, fr = f => openSec + f / 60;
  [[30, 72], [60, 74], [90, 76], [105, 79], [135, 81]].forEach(([f, n], i) => pop(m, fr(f), n, .85, -.3 + i * .15));
  [84, 86, 88, 91].forEach((n, i) => pop(m, fr(172 + i * 6), n, .25));
  pop(m, fr(240), 60, .7, .3); [72, 76, 79].forEach((n, i) => pop(m, fr(240) + i * .06, n, .45, .3));
  pop(m, fr(450), 60, .55); whoosh(m, fr(452), .8, 1.1);
  const title = scenes.find(s => s.engine === "title").bar * BAR; pop(m, title, 60, .8); [72, 76, 79, 84].forEach((n, i) => pop(m, title + [0, .08, .16, .26][i], n, .5));
  scenes.forEach((s, i) => { if (s.take != null || s.img || s.desk) { whoosh(m, s.bar * BAR - .12, .34, .35); pop(m, s.bar * BAR, [72, 76, 79, 84][i % 4], .34, .35); } });
  const send = scenes.find(s => s.head === "送るのは、本人。"); if (send) { const t = send.bar * BAR + (33.2 - send.take); pop(m, t, 60, .6); whoosh(m, t, .7, .9); [72, 76, 79, 84].forEach((n, i) => pop(m, t + .7 + i * .08, n, .42, .4)); }
  const g = scenes.find(s => s.engine === "grow").bar * BAR; [72, 74, 76, 79, 81, 84, 86, 88].forEach((n, i) => pop(m, g + (16 + i * 15) / 60, n, .3, Math.sin(i) * .6));
  const c1 = scenes.find(s => s.engine === "cross1").bar * BAR; pop(m, c1 - 2.2, 72, .4); whoosh(m, c1, .7, .9); pop(m, c1 + .85, 60, .8, .6); [72, 76, 79, 84].forEach((n, i) => pop(m, c1 + .85 + i * .08, n, .5, .6));
  for (let i = 0; i < 20; i++) pop(m, c1 + 1.2 + i * .16, [84, 86, 88, 91, 93][i % 5], .1, Math.sin(i * 1.7) * .9);
  const E = bE * BAR; pop(m, E, 60, .8); [72, 76, 79, 84, 88].forEach((n, i) => pop(m, E + i * .07, n, .55));
  reverb(m, .16); save(m, "full-sfx.wav", .8, pub);
}
console.log("音を作りました", SEC, "秒");
