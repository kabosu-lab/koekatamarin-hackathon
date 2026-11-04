/* 方向の試作の音楽と効果音をコードで作る（素材ファイルなし）。120 BPM、ハ長調 */
import { SR, add, hz, mix, pad, piano, reverb, save } from "./audio-lib.mjs";
const SEC = 20, B = .5, fr = f => f / 60;
function pop(m, at, note, vol = .5, pan = 0) { const s = Math.floor(at * SR), len = Math.floor(.22 * SR), f0 = hz(note); for (let i = 0; i < len; i++) { const t = i / SR, idx = 2.4 * Math.exp(-t * 34), bend = 1 + .12 * Math.exp(-t * 90); add(m, s + i, Math.sin(2 * Math.PI * f0 * bend * t + idx * Math.sin(2 * Math.PI * f0 * 3.5 * t)) * Math.exp(-t * 19) * Math.min(1, i / 40) * vol, pan); } }
let seed = 5; const noise = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
function whoosh(m, at, dur, vol = .8) { const s = Math.floor(at * SR), len = Math.floor(dur * SR); let y1 = 0, y2 = 0; for (let i = 0; i < len; i++) { const k = i / len, w = 2 * Math.PI * (500 + 5200 * k * k) / SR, q = .96, a1 = -2 * q * Math.cos(w), a2 = q * q, y = noise() * .09 - a1 * y1 - a2 * y2; y2 = y1; y1 = y; add(m, s + i, y * Math.sin(Math.PI * k) ** 1.2 * vol, -.8 + 1.6 * k); } }
function kick(m, at, vol = .6) { const s = Math.floor(at * SR), len = Math.floor(.2 * SR); let ph = 0; for (let i = 0; i < len; i++) { const t = i / SR; ph += 2 * Math.PI * (48 + 110 * Math.exp(-t * 38)) / SR; add(m, s + i, Math.sin(ph) * Math.exp(-t * 15) * vol); } }
function hiss(m, at, dur, decay, vol, pan = 0) { const s = Math.floor(at * SR), len = Math.floor(dur * SR); let last = 0; for (let i = 0; i < len; i++) { const t = i / SR, n = noise(), hp = n - last; last = n; add(m, s + i, hp * Math.exp(-t * decay) * vol, pan); } }
function bass(m, at, note, dur, vol = .4, bright = .5) { const s = Math.floor(at * SR), len = Math.floor(dur * SR), f0 = hz(note); for (let i = 0; i < len; i++) { const t = i / SR, v = Math.sin(2 * Math.PI * f0 * t) + bright * Math.sin(4 * Math.PI * f0 * t) * Math.exp(-t * 7) + bright * .4 * Math.sin(6 * Math.PI * f0 * t) * Math.exp(-t * 12); add(m, s + i, v * Math.exp(-t * 3.2) * Math.min(1, i / 70) * Math.min(1, (len - i) / 300) * vol); } }

/* 効果音は3本共通。音楽の上に置く */
function sfx(m, g = 1) {
  [[30, 72], [60, 74], [90, 76], [105, 79], [135, 81]].forEach(([f, n], i) => pop(m, fr(f), n, .8 * g, -.4 + i * .1));
  [84, 86, 88, 91].forEach((n, i) => pop(m, fr(162 + i * 6), n, .25 * g));
  pop(m, fr(210), 60, .7 * g, .3); [72, 76, 79].forEach((n, i) => pop(m, fr(210) + i * .06, n, .45 * g, .3));
  pop(m, fr(238), 79, .35 * g, .3); whoosh(m, fr(238), fr(36), 1.1 * g);
  [[320, 76], [362, 79], [404, 84]].forEach(([f, n]) => pop(m, fr(f), n, .6 * g, 0));
  [[330, 88], [372, 91], [414, 96]].forEach(([f, n]) => pop(m, fr(f), n, .3 * g, .2));
  const penta = [72, 74, 76, 79, 81, 84, 86, 88, 91];
  penta.forEach((n, i) => pop(m, fr(496 + i * 15), n, .42 * g, -.5 + (i % 3) * .5));
  penta.forEach((n, i) => pop(m, fr(738 + i * 15), n + 12 > 100 ? n : n, .32 * g, Math.sin(i) * .6));
  for (let i = 0; i < 26; i++) pop(m, fr(905 + i * 5.5), [84, 86, 88, 91, 93][i % 5] + (i % 7 === 0 ? 12 : 0), .13 * g, Math.sin(i * 1.7) * .9);
  pop(m, fr(1056), 60, .8 * g); [72, 76, 79, 84, 88].forEach((n, i) => pop(m, fr(1056) + i * .07, n, .55 * g));
}
const CH = [[48, 55, 64, 67], [53, 60, 64, 69], [45, 52, 60, 67], [55, 62, 65, 71]]; /* C F Am G */
const barOf = t => Math.floor(t / (B * 4)) % 4;

/* P：明るいファンク。キック、クラップ、はねるベース、短い和音。始めは薄く、だんだん増やす */
{ const m = mix(SEC);
  for (let i = 0; i * B < SEC - 2.5; i++) { const t = i * B, c = CH[barOf(t)], lvl = t < 4.5 ? .45 : 1;
    if (t >= 4.5) kick(m, t, .62);
    if (i % 2 === 1 && t >= 4.5) hiss(m, t, .16, 26, .5);
    hiss(m, t + B / 2, .05, 80, .16 * lvl, .3);
    if (i % 4 === 0) { bass(m, t, c[0] - 12, .3, .42 * lvl); bass(m, t + .75, c[0] - 12, .2, .36 * lvl); bass(m, t + 1.25, c[0], .2, .34 * lvl); bass(m, t + 1.75, c[1] - 12, .2, .34 * lvl); }
    if (i % 2 === 1 && t >= 8) c.slice(1).forEach((n, k) => pop(m, t + B / 2, n + 12, .2, -.3 + k * .3));
  }
  [48, 55, 64, 72, 79].forEach(n => piano(m, 17.5, n, .32, { dur: 2.4 })); kick(m, 17.5, .8);
  reverb(m, .12); sfx(m, 1); save(m, "direction-p.wav", .82);
}
/* Q：マリンバの反復と、シェイカー。軽く前向き */
{ const m = mix(SEC); const line = [0, 2, 3, 1, 2, 3, 1, 2];
  for (let i = 0; i * B / 2 < SEC - 2.5; i++) { const t = i * B / 2, c = CH[barOf(t)], n = c[line[i % 8]] + 12, lvl = t < 4.5 ? .6 : 1;
    pop(m, t, n, .26 * lvl, Math.sin(i * .7) * .4); if (i % 8 === 0) pop(m, t, c[0], .3 * lvl);
    hiss(m, t + .02, .04, 90, (i % 2 ? .14 : .08) * lvl, -.3);
    if (t >= 8 && i % 4 === 0) kick(m, t, .42);
    if (t >= 12 && i % 8 === 2) pop(m, t, c[3] + 24, .14, .4);
  }
  [60, 67, 72, 76, 84].forEach(n => pop(m, 17.5, n, .5)); pad(m, 17.5, [60, 67, 76], 2.4, .03);
  reverb(m, .2); sfx(m, .9); save(m, "direction-q.wav", .82);
}
/* R：ジャズ。ウォーキングベース、ブラシ、スイングするピアノの和音 */
{ const m = mix(SEC), sw = B * 2 / 3; const J = [[48, 64, 67, 71, 74], [45, 60, 64, 67, 71], [50, 65, 69, 72, 76], [43, 65, 67, 71, 74]]; const walk = [[48, 52, 55, 57], [45, 48, 52, 53], [50, 53, 57, 54], [43, 47, 50, 47]];
  for (let bar = 0; bar * B * 4 < SEC - 2.5; bar++) { const t0 = bar * B * 4, c = J[bar % 4], lvl = t0 < 4 ? .6 : 1;
    walk[bar % 4].forEach((n, i) => bass(m, t0 + i * B, n - 12 + 12, .46, .55 * lvl, .35));
    for (let i = 0; i < 4; i++) { hiss(m, t0 + i * B, .14, 20, .11 * lvl, .3); hiss(m, t0 + i * B + sw, .06, 40, .07 * lvl, .3); if (i % 2) hiss(m, t0 + i * B, .1, 30, .13 * lvl, -.2); }
    if (t0 >= 2) { c.slice(1).forEach(n => piano(m, t0 + B + sw, n, .13, { dur: .7 })); if (bar % 2) c.slice(1).forEach(n => piano(m, t0 + 3 * B, n, .11, { dur: .5 })); }
  }
  [36, 48, 64, 67, 71, 74].forEach(n => piano(m, 17.5, n, .24, { dur: 2.5 }));
  reverb(m, .22); sfx(m, .62); save(m, "direction-r.wav", .82);
}
