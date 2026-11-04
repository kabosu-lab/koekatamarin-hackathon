/* 音楽と仮の声をコードで作り、絵と一緒に public/ に置く */
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyArt, hasSay, noteSkippedVoice } from "./asset-tools.mjs";
const require = createRequire(import.meta.url);
const T = require("../src/timing.json");
const pub = new URL("../public/", import.meta.url);
mkdirSync(pub, { recursive: true });

/* --- 絵：Codex で作った絵を .private/art から使う（使ってよいと確認が取れるまで公開しない） --- */
for (const [from, to] of [["beast-2.png", "partner.png"], ["coat-3.png", "colleague.png"], ["jacket-2.png", "student.png"], ["craft-3.png", "senior.png"], ["school-haru.jpg", "school.jpg"]]) {
  copyArt(new URL(`../../.private/art/${from}`, import.meta.url), new URL(to, pub));
}

/* --- 音楽：120 BPM。拍は 15 コマ --- */
const SR = 44100, N = Math.ceil(T.total / T.fps * SR), L = new Float32Array(N), R = new Float32Array(N);
const f2s = f => f / T.fps;
const add = (i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - pan * .6); R[i] += v * (1 + pan * .6); } };
function tone(at, freq, dur, vol, { type = "sine", attack = .004, decay = 4, pan = 0, fm = 0 } = {}) {
  const s = Math.floor(at * SR), len = Math.floor(dur * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR, env = Math.min(1, t / attack) * Math.exp(-t * decay) * Math.min(1, (len - i) / 400);
    const ph = 2 * Math.PI * freq * t + fm * Math.exp(-t * 8) * Math.sin(2 * Math.PI * freq * 3.01 * t);
    const w = type === "saw" ? (Math.sin(ph) + .5 * Math.sin(2 * ph) + .25 * Math.sin(3 * ph)) * .6 : Math.sin(ph);
    add(s + i, w * env * vol, pan);
  }
}
function kick(at, vol = .55) {
  const s = Math.floor(at * SR), len = Math.floor(.26 * SR); let ph = 0;
  for (let i = 0; i < len; i++) { const t = i / SR; ph += 2 * Math.PI * (46 + 110 * Math.exp(-t * 34)) / SR; add(s + i, Math.sin(ph) * Math.exp(-t * 13) * vol); }
}
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
function noise(at, dur, from, to, vol, { pan = 0, q = .93 } = {}) {
  const s = Math.floor(at * SR), len = Math.floor(dur * SR); let y1 = 0, y2 = 0;
  for (let i = 0; i < len; i++) {
    const x = i / len, f = from * Math.pow(to / from, x), w = 2 * Math.PI * f / SR, a1 = -2 * q * Math.cos(w), a2 = q * q;
    const y = rnd() * (1 - q) * 2.4 - a1 * y1 - a2 * y2; y2 = y1; y1 = y;
    add(s + i, y * Math.sin(Math.PI * x) * vol * 3, pan);
  }
}
const hat = (at, vol = .05) => noise(at, .05, 7000, 9000, vol, { q: .6 });
const CHORD = { Am: [110, 220, 261.63, 329.63], F: [87.31, 174.61, 261.63, 349.23], C: [130.81, 261.63, 329.63, 392], G: [98, 196, 293.66, 392], Fmaj: [87.31, 220, 349.23, 523.25] };
/* 1小節 = 2秒 */
const bars = ["Am", "Am", "F", "Am", "C", "G", "F", "C"];
bars.forEach((name, b) => {
  const at = b * 2, bright = b >= 4, c = CHORD[name];
  tone(at, c[0], 2.1, bright ? .2 : .16, { decay: .7, attack: .02 });
  for (let k = 0; k < 4; k++) {
    const beat = at + k * .5;
    if (b >= 1 && (k % 2 === 0 || bright)) kick(beat, bright ? .5 : .36);
    if (b >= 2) { hat(beat + .25, bright ? .06 : .035); }
    const n = c[1 + (k + b) % 3] * (bright ? 2 : 1);
    tone(beat, n, .6, bright ? .1 : .07, { fm: bright ? 1.4 : .8, decay: 5, pan: k % 2 ? .4 : -.4 });
  }
  if (bright) c.slice(1).forEach(f => tone(at, f, 2.1, .035, { attack: .25, decay: .5, type: "saw" }));
});
/* 動きに合わせた音 */
T.whips.forEach(f => noise(f2s(f - 6), .32, 500, 5200, .13, { pan: .4 }));
T.pops.forEach((f, i) => { const b = 360 + i * 44; const s = Math.floor(f2s(f) * SR), len = .085 * SR; let ph = 0; for (let j = 0; j < len; j++) { const x = j / len; ph += 2 * Math.PI * b * (.72 + .55 * Math.min(1, x * 2)) / SR; add(s + j, Math.sin(ph) * Math.min(1, j / 60) * Math.pow(1 - x, 2.2) * .36); } });
noise(f2s(T.swoosh), .34, 1100, 8000, .28);
[0, 6, 12, 18].forEach((d, i) => tone(f2s(384 + d), [1046.5, 1318.51, 1567.98, 2093][i], 1.6, .15, { fm: 1.6, decay: 2.6 }));
tone(f2s(384), 130.81, 2.4, .2, { decay: .8, attack: .02 });
/* 残響 */
for (const [d, g] of [[.109, .2], [.173, .15], [.257, .1]]) { const k = Math.floor(d * SR); for (let i = N - 1; i >= k; i--) { L[i] += L[i - k] * g; R[i] += R[i - k] * g; } }
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const gain = .8 / peak, wav = Buffer.alloc(44 + N * 4);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { wav.writeInt16LE(L[i] * gain * 32767 | 0, 44 + i * 4); wav.writeInt16LE(R[i] * gain * 32767 | 0, 46 + i * 4); }
writeFileSync(new URL("music.wav", pub), wav);

/* --- 仮の声（Mac の Kyoko） --- */
if (!hasSay()) noteSkippedVoice(T.voice.length);
else for (const v of T.voice) {
  const aiff = new URL(`${v.id}.aiff`, pub).pathname, out = new URL(`${v.id}.wav`, pub).pathname;
  execFileSync("say", ["-v", "Kyoko", "-r", "205", "-o", aiff, v.text]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "44100", "-ac", "2", out]);
  rmSync(aiff);
  const len = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
  console.log(`${v.id} ${len.toFixed(2)}秒 ${(v.at / T.fps).toFixed(2)}〜${(v.at / T.fps + len).toFixed(2)}`);
}
console.log("素材をコードで作りました");
