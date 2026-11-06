/**
 * 自習室の3曲の組み立て。動画用の BGM（ピアノとベース、エレピのシンセポップ、はじく弦と木琴）から、
 * 和音の進行・旋律の型・楽器を受け継ぎ、無音や盛り上がりを抜いて、勉強の邪魔をしない静かなひと回りにした。
 * 16 小節：最初の4小節は和音と持続音だけ、5小節目から刻みが入り、5・13小節目で主題が鳴る。
 * 16 小節目の終わりは 1 小節目の頭へそのままつながる（はみ出た音は頭に重なる）。
 */
import { type Track, type TrackId, loopMs, trackOf } from "./tracks";
import { bass, epiano, hat, kick, lead, makeMix, marimba, type Mix, normalize, pad, piano, pluck, pop, reverb, shaker } from "./synth";

/** 旋律の型：[拍の位置, 音, 長さ(拍)]。相対音程（0 = ド） */
const MOTIF = [[0, 7, 0.5], [0.5, 9, 0.5], [1, 12, 1], [2, 14, 0.5], [2.5, 12, 0.5], [3, 9, 1], [4, 7, 0.5], [4.5, 9, 0.5], [5, 12, 1.5], [6.5, 16, 1.5]] as const;
/** 静かな動機：ミ ソ ラ ド */
const INTRO = [[0, 4, 1], [1, 7, 1], [2, 9, 1], [3, 12, 2]] as const;

type Step = { t: number; bar: number; beat: number; B: number };
/** 1拍ごとに呼ぶ。t は秒、B は1拍の秒 */
type Arranger = (m: Mix, step: Step) => void;

/** 案1「ピアノとベース」：温かく、前向き。Cmaj9 → Em7 → Fmaj7 → G(add9) */
const PIANO_PROG = [
  { root: 36, voice: [52, 55, 59, 62], top: 74 },
  { root: 40, voice: [55, 59, 62, 64], top: 71 },
  { root: 41, voice: [57, 60, 64, 65], top: 72 },
  { root: 43, voice: [59, 62, 67, 69], top: 74 },
];
const pianoBar: Arranger = (m, { t, bar, beat, B }) => {
  const c = PIANO_PROG[bar % 4], head = beat === 0, BAR = B * 4;
  const motif = (t0: number, notes: readonly (readonly number[])[], vol: number, oct = 0) =>
    notes.forEach(([a, n, l]) => piano(m, t0 + a * B, 60 + n + oct, vol, { dur: l * B + 1.2, pan: 0.15 }));
  if (head) {
    c.voice.forEach((n, k) => piano(m, t + k * 0.012, n, 0.14, { pan: -0.3 + k * 0.2, dur: BAR + 0.8 }));
    pad(m, t, [c.root + 12], BAR, 0.018, { attack: 0.3 });
  }
  if (beat % 2 === 0) bass(m, t, c.root, B * 1.8, 0.28, { bright: 0.35 });
  if (bar >= 4) {
    hat(m, t + B / 2, 0.022);
    if (beat % 2 === 0) kick(m, t, 0.28);
  }
  if (bar >= 8 && (beat === 1 || beat === 3)) shaker(m, t, 0.035);
  if (bar === 0 && head) motif(t + B, INTRO, 0.16);
  if (bar === 4 && head) motif(t, MOTIF, 0.17);
  if (bar === 12 && head) motif(t, MOTIF, 0.13, 12);
  if (bar % 8 >= 6 && (beat === 1 || beat === 3)) piano(m, t + B / 2, c.top, 0.08, { dur: 0.9, pan: 0.35 });
};

/** 案2「エレピのシンセポップ」：明るく、軽い。F → G → Em7 → Am7 */
const EPIANO_PROG = [
  { root: 41, voice: [57, 60, 64, 65], top: 72 },
  { root: 43, voice: [55, 59, 62, 67], top: 74 },
  { root: 40, voice: [52, 55, 59, 62], top: 71 },
  { root: 45, voice: [57, 60, 64, 67], top: 72 },
];
const epianoBar: Arranger = (m, { t, bar, beat, B }) => {
  const c = EPIANO_PROG[bar % 4], head = beat === 0, BAR = B * 4;
  const stab = (at: number, vol: number, dur: number) => c.voice.forEach((n, k) => epiano(m, at + k * 0.006, n, vol, { dur, pan: -0.3 + k * 0.2 }));
  if (head) stab(t, 0.12, BAR * 0.7);
  if (beat === 2) stab(t + B / 2, 0.06, B * 0.8);
  if (head) pad(m, t, [c.root + 12, c.voice[1]], BAR, 0.02, { attack: 0.4 });
  if (bar < 4) {
    if (beat % 2 === 0) bass(m, t, c.root, B * 1.6, 0.26, { bright: 0.4 });
  } else {
    // オクターブで動くベースを、やわらかく
    bass(m, t, c.root, B * 0.55, 0.24, { bright: 0.6 });
    bass(m, t + B / 2, c.root + 12, B * 0.4, 0.16, { bright: 0.6 });
    if (beat % 2 === 0) kick(m, t, 0.26);
    hat(m, t + B / 2, 0.026);
  }
  if (bar === 0 && head) INTRO.forEach(([a, n, l]) => epiano(m, t + B + a * B, 72 + n, 0.12, { dur: l * B + 1.5 }));
  if ((bar === 4 || bar === 12) && head) MOTIF.forEach(([a, n, l]) => lead(m, t + a * B, 72 + n - (bar === 4 ? 12 : 0), 0.13, { dur: l * B * 0.9, pan: 0.1, glide: -0.02 }));
  if (bar % 4 === 3 && beat === 3) pop(m, t + B / 2, c.top + 12, 0.06, 0.3);
};

/** 案3「はじく弦と木琴」：手作りの温かさ、軽やか。C → G/B → Am7 → F */
const PLUCK_PROG = [
  { root: 36, arp: [48, 55, 60, 64, 67, 64, 60, 55], top: 72 },
  { root: 35, arp: [47, 55, 59, 62, 67, 62, 59, 55], top: 74 },
  { root: 33, arp: [45, 52, 57, 60, 64, 60, 57, 52], top: 72 },
  { root: 29, arp: [41, 48, 53, 57, 60, 57, 53, 48], top: 69 },
];
const pluckBar: Arranger = (m, { t, bar, beat, B }) => {
  const c = PLUCK_PROG[bar % 4], head = beat === 0, BAR = B * 4;
  const every = bar < 4 ? 2 : 1;
  for (let k = 0; k < 2; k++) {
    const idx = beat * 2 + k;
    if (idx % every) continue;
    pluck(m, t + (k * B) / 2, c.arp[idx], 0.17, { pan: -0.25 + (idx % 4) * 0.17, dur: 1.6 });
  }
  if (head) pad(m, t, [c.root + 12], BAR, 0.016, { attack: 0.4 });
  if (beat % 2 === 0) bass(m, t, c.root, B * 1.6, 0.26, { bright: 0.3 });
  if (bar >= 4) {
    shaker(m, t + B / 2, 0.035);
    if (beat % 2 === 0) kick(m, t, 0.24);
  }
  const motif = (t0: number, notes: readonly (readonly number[])[], vol: number, oct = 0) => notes.forEach(([a, n]) => marimba(m, t0 + a * B, 60 + n + oct, vol, { pan: 0.15 }));
  if (bar === 0 && head) motif(t + B, INTRO, 0.18, 12);
  if (bar === 4 && head) motif(t, MOTIF, 0.22);
  if (bar === 12 && head) motif(t, MOTIF, 0.18, 12);
  if (bar % 8 >= 6 && (beat === 1 || beat === 3)) marimba(m, t + B / 2, c.top, 0.08, { pan: 0.35 });
};

const ARRANGERS: Record<TrackId, { bar: Arranger; wet: number }> = {
  piano: { bar: pianoBar, wet: 0.18 },
  epiano: { bar: epianoBar, wet: 0.14 },
  pluck: { bar: pluckBar, wet: 0.16 },
};

/** 曲のひと回りを、拍ごとの小さな仕事の列にする。順に実行すれば、いつでも同じ音になる */
function jobs(track: Track, m: Mix): (() => void)[] {
  const B = 60 / track.bpm;
  const { bar, wet } = ARRANGERS[track.id];
  const list: (() => void)[] = [];
  for (let index = 0; index < track.bars * 4; index++) {
    const step = { t: index * B, bar: Math.floor(index / 4), beat: index % 4, B };
    list.push(() => bar(m, step));
  }
  list.push(() => reverb(m, wet));
  list.push(() => normalize(m, 0.9));
  return list;
}

/** すぐに全部作る（テストと、急がないとき用） */
export function renderLoop(id: TrackId, sampleRate: number): Mix {
  const track = trackOf(id);
  const m = makeMix(loopMs(track) / 1000, sampleRate, track.seed);
  for (const job of jobs(track, m)) job();
  return m;
}

/**
 * 画面を止めないよう、少しずつ作る。数ミリ秒ごとにブラウザへ順番を返す。
 * signal で止められる（曲がまた変わったときなど）。
 */
export async function renderLoopGently(id: TrackId, sampleRate: number, signal?: AbortSignal): Promise<Mix | null> {
  const track = trackOf(id);
  const m = makeMix(loopMs(track) / 1000, sampleRate, track.seed);
  let since = performance.now();
  for (const job of jobs(track, m)) {
    if (signal?.aborted) return null;
    job();
    if (performance.now() - since > 12) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      since = performance.now();
    }
  }
  return signal?.aborted ? null : m;
}
