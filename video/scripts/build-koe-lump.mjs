/* 声のかたまりの音：ポポポ（言葉）、シューン（飛ぶ）、ポン（届く） */
import { SR, add, hz, mix, piano, reverb, save } from "./audio-lib.mjs";
const m = mix(7), sec = f => f / 60;
/* 木琴に近い音（FM）。ハ長調のペンタトニックにそろえ、短く切る */
function pop(at, note, vol = .5, pan = 0) {
  const s = Math.floor(at * SR), len = Math.floor(.22 * SR), f0 = hz(note);
  for (let i = 0; i < len; i++) {
    const t = i / SR, index = 2.4 * Math.exp(-t * 34), bend = 1 + .12 * Math.exp(-t * 90);
    const v = Math.sin(2 * Math.PI * f0 * bend * t + index * Math.sin(2 * Math.PI * f0 * 3.5 * t));
    add(m, s + i, v * Math.exp(-t * 19) * Math.min(1, i / 40) * vol, pan);
  }
}
function whoosh(at, dur, vol = .3) {
  const s = Math.floor(at * SR), len = Math.floor(dur * SR); let y1 = 0, y2 = 0, seed = 7;
  for (let i = 0; i < len; i++) {
    const k = i / len, w = 2 * Math.PI * (500 + 5200 * k * k) / SR, q = .96, a1 = -2 * q * Math.cos(w), a2 = q * q;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = (seed / 2147483648 - 1) * .09 - a1 * y1 - a2 * y2; y2 = y1; y1 = y;
    add(m, s + i, y * Math.sin(Math.PI * k) ** 1.2 * vol, -.8 + 1.6 * k);
  }
}
[[20, 72], [46, 74], [72, 76], [98, 79], [124, 81]].forEach(([f, n], i) => pop(sec(f), n, .55, -.5 + i * .1));
[84, 86, 88, 91].forEach((n, i) => pop(sec(172 + i * 7), n, .2));
pop(sec(200), 60, .55);
whoosh(sec(205), sec(47), .9);
pop(sec(250), 60, .8, .5);
[[0, 72], [.08, 76], [.16, 79], [.26, 84]].forEach(([d, n]) => pop(sec(250) + d, n, .5, .4));
piano(m, sec(250) + .26, 84, .16, { pan: .4, dur: 1.4 });
pop(sec(284), 84, .32, .5); pop(sec(296), 88, .32, .5); pop(sec(316), 91, .32, .5);
reverb(m, .18); save(m, "koe-lump.wav", .75);
