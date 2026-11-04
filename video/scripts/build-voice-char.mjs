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
[[40, 72], [70, 74], [100, 76], [115, 79], [145, 81]].forEach(([f, n], i) => pop(sec(f), n, .55, -.3 + i * .15));
[84, 86, 88, 91].forEach((n, i) => pop(sec(180 + i * 7), n, .2, .3));
whoosh(sec(240), sec(50), .9);
pop(sec(262), 60, .55);
pop(sec(278), 60, .8, .6);
[[0, 72], [.08, 76], [.16, 79], [.26, 84]].forEach(([d, n]) => pop(sec(278) + d, n, .5, .6));
piano(m, sec(278) + .26, 84, .16, { pan: .5, dur: 1.4 });
pop(sec(290), 84, .3, -.3);
reverb(m, .18); save(m, "voice-char.wav", .75);
