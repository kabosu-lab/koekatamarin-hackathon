/* 音をコードで作る部品。素材ファイルは使わない */
import { writeFileSync } from "node:fs";

export const SR = 44100;
export const mix = (sec = 15) => ({ L: new Float32Array(SR * sec), R: new Float32Array(SR * sec) });
export const add = (m, i, v, pan = 0) => { if (i >= 0 && i < m.L.length) { m.L[i] += v * (1 - pan * .5); m.R[i] += v * (1 + pan * .5); } };
export const hz = n => 440 * Math.pow(2, (n - 69) / 12);

/* ピアノに近い音：倍音ごとに減衰を変え、弦のわずかなずれで揺らす */
export function piano(m, at, note, vol = .2, { pan = 0, dur = 5 } = {}) {
  const f = hz(note), s = Math.floor(at * SR), len = Math.floor(dur * SR);
  const parts = [[1, 1, 1.0], [2, .42, 1.7], [3, .2, 2.6], [4, .09, 3.6], [5, .05, 4.8], [6, .025, 6]];
  for (let i = 0; i < len; i++) {
    const t = i / SR, atk = Math.min(1, t / .006), rel = Math.min(1, (len - i) / 3000);
    let v = 0;
    for (const [k, a, d] of parts) {
      const fk = f * k * Math.sqrt(1 + .0004 * k * k);
      v += a * Math.exp(-t * d * .75) * (Math.sin(2 * Math.PI * fk * t) + .6 * Math.sin(2 * Math.PI * fk * 1.0007 * t));
    }
    add(m, s + i, v * atk * rel * vol * .32, pan);
  }
}
/* やわらかい持続音 */
export function pad(m, at, notes, dur, vol = .03) {
  const s = Math.floor(at * SR), len = Math.floor(dur * SR);
  for (const n of notes) {
    const f = hz(n);
    for (let i = 0; i < len; i++) {
      const t = i / SR, env = Math.sin(Math.PI * Math.min(1, i / len)) ** 1.2;
      add(m, s + i, (Math.sin(2 * Math.PI * f * t) + .25 * Math.sin(4 * Math.PI * f * t + .4)) * env * vol, 0);
    }
  }
}
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
/* ペン先と紙の音：帯域を絞った雑音を細かく区切る */
export function pen(m, at, dur, vol = .05) {
  const s = Math.floor(at * SR), len = Math.floor(dur * SR); let y1 = 0, y2 = 0;
  const q = .9, w = 2 * Math.PI * 3200 / SR, a1 = -2 * q * Math.cos(w), a2 = q * q;
  for (let i = 0; i < len; i++) {
    const t = i / SR, stroke = .35 + .65 * Math.abs(Math.sin(t * 19 + Math.sin(t * 7) * 2));
    const y = rnd() * .2 - a1 * y1 - a2 * y2; y2 = y1; y1 = y;
    add(m, s + i, y * stroke * Math.min(1, i / 500) * Math.min(1, (len - i) / 800) * vol);
  }
}
/* 操作音：短く小さく、ハ長調の上がる音 */
export function tick(m, at, note, vol = .05) { piano(m, at, note, vol, { dur: .5 }); }
/* 部屋の残響：減衰する雑音を畳み込む代わりに、間隔の違う遅延を重ねる */
export function reverb(m, wet = .25) {
  const taps = [[.031, .5], [.047, .45], [.073, .4], [.109, .34], [.157, .28], [.211, .22], [.293, .17], [.389, .12], [.521, .08], [.701, .05]];
  const srcL = m.L.slice(), srcR = m.R.slice();
  for (const [d, g] of taps) {
    const k = Math.floor(d * SR);
    for (let i = k; i < m.L.length; i++) { m.L[i] += srcR[i - k] * g * wet; m.R[i] += srcL[i - k] * g * wet; }
  }
}
export function save(m, name, level = .7, pub = new URL("../public/", import.meta.url)) {
  let peak = 0; const N = m.L.length;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(m.L[i]), Math.abs(m.R[i]));
  const gain = level / peak, wav = Buffer.alloc(44 + N * 4);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    const fade = Math.min(1, (N - i) / (SR * .4));
    wav.writeInt16LE(m.L[i] * gain * fade * 32767 | 0, 44 + i * 4); wav.writeInt16LE(m.R[i] * gain * fade * 32767 | 0, 46 + i * 4);
  }
  writeFileSync(new URL(name, pub), wav);
}

