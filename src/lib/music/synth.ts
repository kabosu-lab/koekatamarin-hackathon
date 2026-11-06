/**
 * 音をコードで作る部品（素材ファイルなし）。動画用の BGM で作った音色を、自習室で回せる形に移したもの。
 * 音はくり返しの輪（ループ）の長さの Float32 に足していく。終わりからはみ出た音は頭に戻して足すので、
 * つなぎ目で音が途切れず、どこから聴き始めても同じに聞こえる。
 * 乱数は曲ごとに決まった種から作るので、誰の端末でも同じ音になる。
 */

export type Mix = {
  L: Float32Array<ArrayBuffer>;
  R: Float32Array<ArrayBuffer>;
  /** 1秒あたりの数 */
  sr: number;
  rnd: () => number;
};

export const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

export function makeMix(seconds: number, sr: number, seed: number): Mix {
  const length = Math.round(seconds * sr);
  let state = seed >>> 0;
  return {
    L: new Float32Array(length),
    R: new Float32Array(length),
    sr,
    rnd: () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2147483648 - 1,
  };
}

/** 輪の中の位置に足す。はみ出た分は頭に戻る。pan は -1（左）〜 1（右） */
function add(m: Mix, i: number, v: number, pan = 0) {
  const n = m.L.length;
  const k = ((i % n) + n) % n;
  m.L[k] += v * (1 - Math.max(0, pan));
  m.R[k] += v * (1 + Math.min(0, pan));
}

const TAU = 2 * Math.PI;

/* ---- 音色 ---- */

/** ピアノに近い音：倍音ごとに減衰を変える */
export function piano(m: Mix, at: number, note: number, vol = 0.2, { pan = 0, dur = 4 } = {}) {
  const f = hz(note), s = Math.floor(at * m.sr), len = Math.floor(dur * m.sr);
  const parts = [[1, 1, 1.0], [2, 0.4, 1.8], [3, 0.18, 2.8], [4, 0.08, 3.8], [5, 0.04, 5], [6, 0.02, 6.5]]
    .map(([k, a, d]) => ({ w: TAU * f * k * Math.sqrt(1 + 0.0003 * k * k), a, decay: Math.exp((-d * 0.8) / m.sr) }))
    .filter((part) => part.w / TAU < m.sr / 2);
  const hi = Math.max(0.3, 1 - (note - 60) / 60);
  const release = 2500 * (m.sr / 44100);
  // 正弦波は Math.sin を毎回呼ばず、回転で進める（同じ音で、ずっと軽い）。
  // 1本の倍音に、わずかにずらした2本目（位相 0.3）を重ねる。振幅と減衰も回転に含める
  const count = parts.length;
  const re = new Float64Array(count * 2), im = new Float64Array(count * 2), cr = new Float64Array(count * 2), ci = new Float64Array(count * 2);
  parts.forEach(({ w, a, decay }, p) => {
    const step = w / m.sr, step2 = (w * 1.0008) / m.sr;
    re[p * 2] = a; im[p * 2] = 0;
    re[p * 2 + 1] = a * 0.5 * Math.cos(0.3); im[p * 2 + 1] = a * 0.5 * Math.sin(0.3);
    cr[p * 2] = Math.cos(step) * decay; ci[p * 2] = Math.sin(step) * decay;
    cr[p * 2 + 1] = Math.cos(step2) * decay; ci[p * 2 + 1] = Math.sin(step2) * decay;
  });
  // 回転の式では、出す値は虚部（sin）
  for (let i = 0; i < len; i++) {
    const t = i / m.sr, atk = Math.min(1, t / 0.005), rel = Math.min(1, (len - i) / release);
    let v = 0;
    for (let q = 0; q < count * 2; q++) {
      v += im[q];
      const r = re[q] * cr[q] - im[q] * ci[q];
      im[q] = re[q] * ci[q] + im[q] * cr[q];
      re[q] = r;
    }
    add(m, s + i, v * atk * rel * vol * 0.3 * hi, pan);
  }
}

/** エレピ：FM 2 オペレータ。鈴のような倍音を少し */
export function epiano(m: Mix, at: number, note: number, vol = 0.2, { pan = 0, dur = 2.5 } = {}) {
  const f = hz(note), s = Math.floor(at * m.sr), len = Math.floor(dur * m.sr);
  const release = 2000 * (m.sr / 44100);
  for (let i = 0; i < len; i++) {
    const t = i / m.sr, idx = 1.5 * Math.exp(-t * 3.5) + 0.12;
    const env = Math.min(1, t / 0.003) * Math.exp(-t * 2.4) * Math.min(1, (len - i) / release);
    const v = Math.sin(TAU * f * t + idx * Math.sin(TAU * f * t)) + 0.08 * Math.exp(-t * 9) * Math.sin(TAU * f * 7 * t);
    add(m, s + i, v * env * vol * 0.5, pan);
  }
}

/** 弦をはじく音（Karplus–Strong） */
export function pluck(m: Mix, at: number, note: number, vol = 0.25, { pan = 0, dur = 2, damp = 0.996, soft = 0.5 } = {}) {
  const f = hz(note), N = Math.max(2, Math.round(m.sr / f)), buf = new Float32Array(N);
  const s = Math.floor(at * m.sr), len = Math.floor(dur * m.sr);
  // 低い sr では1周が短くなるので、減衰を時間に合わせ直す
  const d = damp ** (44100 / m.sr);
  let last = 0;
  for (let i = 0; i < N; i++) {
    last = last * soft + m.rnd() * (1 - soft);
    buf[i] = last;
  }
  const release = 1500 * (m.sr / 44100);
  let p = 0;
  for (let i = 0; i < len; i++) {
    const cur = buf[p], nxt = buf[(p + 1) % N];
    buf[p] = (cur + nxt) * 0.5 * d;
    p = (p + 1) % N;
    add(m, s + i, cur * vol * Math.min(1, (len - i) / release) * 1.4, pan);
  }
}

/** 木琴に近い音：基音と 4 倍音、短い減衰 */
export function marimba(m: Mix, at: number, note: number, vol = 0.25, { pan = 0 } = {}) {
  const f = hz(note), s = Math.floor(at * m.sr), len = Math.floor(1.2 * m.sr);
  for (let i = 0; i < len; i++) {
    const t = i / m.sr;
    let v = Math.sin(TAU * f * t) * Math.exp(-t * 7) + 0.35 * Math.sin(TAU * f * 3.93 * t) * Math.exp(-t * 26);
    if (f * 9.5 < m.sr / 2) v += 0.15 * Math.sin(TAU * f * 9.5 * t) * Math.exp(-t * 60);
    add(m, s + i, v * Math.min(1, t / 0.002) * vol * 0.6, pan);
  }
}

/** やわらかい鉛筆のようなリード：倍音を低域寄りに */
export function lead(m: Mix, at: number, note: number, vol = 0.18, { pan = 0, dur = 0.5, glide = 0 } = {}) {
  const f = hz(note), s = Math.floor(at * m.sr), len = Math.floor(dur * m.sr);
  const release = 1200 * (m.sr / 44100);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / m.sr, env = Math.min(1, t / 0.02) * Math.min(1, (len - i) / release) * (0.6 + 0.4 * Math.exp(-t * 4));
    ph += (TAU * f * (1 + glide * Math.exp(-t * 30))) / m.sr;
    const v = Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph) + 0.12 * Math.sin(4 * ph) + 0.04 * Math.sin(5 * ph) * Math.exp(-t * 2);
    add(m, s + i, v * env * vol * 0.45 + 0.03 * Math.sin(ph * 0.5) * env * vol, pan);
  }
}

/** ベース：基音と減衰する倍音 */
export function bass(m: Mix, at: number, note: number, dur: number, vol = 0.4, { bright = 0.5 } = {}) {
  const f = hz(note), s = Math.floor(at * m.sr), len = Math.floor(dur * m.sr);
  const attack = 80 * (m.sr / 44100), release = 400 * (m.sr / 44100);
  for (let i = 0; i < len; i++) {
    const t = i / m.sr;
    const v = Math.sin(TAU * f * t) + bright * Math.sin(2 * TAU * f * t) * Math.exp(-t * 6) + bright * 0.35 * Math.sin(3 * TAU * f * t) * Math.exp(-t * 10);
    add(m, s + i, v * Math.exp(-t * 2.2) * Math.min(1, i / attack) * Math.min(1, (len - i) / release) * vol);
  }
}

/** 持続音：少しずらした 3 本の正弦波 */
export function pad(m: Mix, at: number, notes: readonly number[], dur: number, vol = 0.05, { pan = 0, attack = 0.6 } = {}) {
  const s = Math.floor(at * m.sr), len = Math.floor(dur * m.sr), a = Math.floor(attack * m.sr), r = Math.floor(Math.min(0.8, dur / 3) * m.sr);
  for (const n of notes) {
    const d1 = (TAU * hz(n)) / m.sr, d2 = d1 * 1.004, d3 = d1 * 0.9965;
    let p1 = 0, p2 = 0, p3 = 0;
    for (let i = 0; i < len; i++) {
      p1 += d1; p2 += d2; p3 += d3;
      const env = Math.min(1, i / a) * Math.min(1, (len - i) / r);
      add(m, s + i, (Math.sin(p1) + Math.sin(p2) * 0.7 + Math.sin(p3) * 0.7 + 0.15 * Math.sin(2 * p1)) * env * vol, pan);
    }
  }
}

/* ---- 打楽器 ---- */

export function kick(m: Mix, at: number, vol = 0.6) {
  const s = Math.floor(at * m.sr), len = Math.floor(0.22 * m.sr);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / m.sr;
    ph += (TAU * (50 + 100 * Math.exp(-t * 36))) / m.sr;
    add(m, s + i, (Math.sin(ph) + 0.3 * Math.exp(-t * 120) * m.rnd()) * Math.exp(-t * 14) * vol);
  }
}

function bandNoise(m: Mix, at: number, dur: number, freq: number, q: number, vol: number, decay: number, pan = 0) {
  const s = Math.floor(at * m.sr), len = Math.floor(dur * m.sr), w = (TAU * Math.min(freq, m.sr * 0.45)) / m.sr;
  const a1 = -2 * q * Math.cos(w), a2 = q * q, release = 200 * (m.sr / 44100);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / m.sr, y = m.rnd() * (1 - q) * 2 - a1 * y1 - a2 * y2;
    y2 = y1; y1 = y;
    add(m, s + i, y * Math.exp(-t * decay) * Math.min(1, (len - i) / release) * vol, pan);
  }
}

export function hat(m: Mix, at: number, vol = 0.06, { open = false, pan = 0.25 } = {}) {
  bandNoise(m, at, open ? 0.3 : 0.07, 8500, 0.5, vol * 2.2, open ? 14 : 70, pan);
}

export function shaker(m: Mix, at: number, vol = 0.05, { pan = -0.2 } = {}) {
  bandNoise(m, at, 0.12, 5200, 0.75, vol * 2.2, 36, pan);
}

/** ポッ：短い音程の上がる音 */
export function pop(m: Mix, at: number, note: number, vol = 0.5, pan = 0) {
  const s = Math.floor(at * m.sr), len = Math.floor(0.2 * m.sr), f0 = hz(note), attack = 40 * (m.sr / 44100);
  for (let i = 0; i < len; i++) {
    const t = i / m.sr, idx = 2 * Math.exp(-t * 30), bend = 1 + 0.1 * Math.exp(-t * 80);
    add(m, s + i, Math.sin(TAU * f0 * bend * t + idx * Math.sin(TAU * f0 * 3.5 * t)) * Math.exp(-t * 18) * Math.min(1, i / attack) * vol, pan);
  }
}

/* ---- 仕上げ ---- */

/** 部屋の残響：間隔の違う遅延を重ねる（左右を交差）。輪なので、頭の残響には終わりの音が入る */
export function reverb(m: Mix, wet = 0.2) {
  const taps = [[0.029, 0.55], [0.043, 0.48], [0.071, 0.42], [0.107, 0.35], [0.149, 0.28], [0.197, 0.22], [0.271, 0.16], [0.353, 0.11], [0.457, 0.07], [0.601, 0.04]];
  const n = m.L.length, srcL = m.L.slice(), srcR = m.R.slice();
  for (const [d, g] of taps) {
    const k = Math.floor(d * m.sr);
    for (let i = 0; i < n; i++) {
      const j = (i - k + n) % n;
      m.L[i] += srcR[j] * g * wet;
      m.R[i] += srcL[j] * g * wet;
    }
  }
}

export function peakOf(m: Mix): number {
  let p = 0;
  for (let i = 0; i < m.L.length; i++) p = Math.max(p, Math.abs(m.L[i]), Math.abs(m.R[i]));
  return p;
}

/** いちばん大きいところを peak にそろえる */
export function normalize(m: Mix, peak = 0.9) {
  const gain = peak / (peakOf(m) || 1);
  for (let i = 0; i < m.L.length; i++) {
    m.L[i] *= gain;
    m.R[i] *= gain;
  }
}
