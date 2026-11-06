import { sendTiming } from "./lumps";

/**
 * 送るときの音の組み立て。動画の音（video/scripts/build-voice-char.mjs の pop と whoosh）を基準にする。
 * すべてハ長調のペンタトニックにそろえ、言葉ごとに音階が上がる。
 */
const WORD_NOTES = [72, 74, 76, 79, 81];
const GATHER_NOTES = [84, 86, 88, 91];
const LAND_NOTES: [number, number][] = [
  [0, 72],
  [0.08, 76],
  [0.16, 79],
  [0.26, 84],
];

export const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** 木琴に近い音（FM）。鳴り始めだけ明るく、すぐ落ち着く。 */
export function schedulePop(audio: BaseAudioContext, out: AudioNode, at: number, note: number, volume: number) {
  const frequency = hz(note);
  const modulation = frequency * 3.5;
  const carrier = audio.createOscillator();
  carrier.frequency.setValueAtTime(frequency * 1.12, at);
  carrier.frequency.setTargetAtTime(frequency, at, 1 / 90);

  const modulator = audio.createOscillator();
  modulator.frequency.value = modulation;
  const depth = audio.createGain();
  depth.gain.setValueAtTime(2.4 * modulation, at);
  depth.gain.setTargetAtTime(0, at, 1 / 34);
  modulator.connect(depth).connect(carrier.frequency);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.001);
  gain.gain.setTargetAtTime(0, at + 0.001, 1 / 19);
  carrier.connect(gain).connect(out);

  for (const tone of [carrier, modulator]) {
    tone.start(at);
    tone.stop(at + 0.24);
  }
}

function curve(length: number, value: (position: number) => number): Float32Array<ArrayBuffer> {
  const points = new Float32Array(length);
  for (let i = 0; i < length; i++) points[i] = value(i / (length - 1));
  return points;
}

/** シューン：高さが上がっていく雑音。音量はなめらかに膨らんで消える。 */
function scheduleWhoosh(audio: BaseAudioContext, out: AudioNode, at: number, duration: number, volume: number) {
  const length = Math.floor(audio.sampleRate * duration);
  const noise = audio.createBuffer(1, length, audio.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  source.buffer = noise;

  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 3;
  filter.frequency.setValueCurveAtTime(curve(32, (k) => 500 + 5200 * k * k), at, duration);

  const gain = audio.createGain();
  gain.gain.setValueCurveAtTime(curve(32, (k) => Math.sin(Math.PI * k) ** 1.2 * volume), at, duration);
  source.connect(filter).connect(gain).connect(out);
  source.start(at);
  source.stop(at + duration);
}

/** ヒューン：音程がなめらかに上がり、遠ざかるときに少し下がる。 */
function scheduleHyun(audio: BaseAudioContext, out: AudioNode, at: number, duration: number, volume: number) {
  const pitch = (k: number) => (k < 0.8 ? 520 * (3100 / 520) ** ((k / 0.8) ** 1.5) : 3100 - 900 * ((k - 0.8) / 0.2));
  const voices: [OscillatorType, number, number][] = [
    ["sine", 1, 1],
    ["triangle", 0.5, 0.35],
  ];
  for (const [type, ratio, level] of voices) {
    const tone = audio.createOscillator();
    tone.type = type;
    tone.frequency.setValueCurveAtTime(curve(48, (k) => pitch(k) * ratio), at, duration);
    const gain = audio.createGain();
    gain.gain.setValueCurveAtTime(curve(32, (k) => Math.sin(Math.PI * k ** 0.7) ** 1.4 * volume * level), at, duration);
    tone.connect(gain).connect(out);
    tone.start(at);
    tone.stop(at + duration);
  }
}

/** 届いたあとの短いピアノのような音。 */
function schedulePiano(audio: BaseAudioContext, out: AudioNode, at: number, note: number, volume: number) {
  const partials: [number, number, number][] = [
    [1, 1, 0.4],
    [2, 0.42, 0.22],
    [3, 0.16, 0.12],
  ];
  for (const [ratio, level, decay] of partials) {
    const tone = audio.createOscillator();
    tone.frequency.value = hz(note) * ratio;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume * level, at + 0.003);
    gain.gain.setTargetAtTime(0, at + 0.003, decay);
    tone.connect(gain).connect(out);
    tone.start(at);
    tone.stop(at + 1.2);
  }
}

/** 言葉（音階が上がる）→ 固まる → ためる → ヒューン → 低い音 → 届く和音 → ピアノ。t0 は動きの始まり。 */
export function scheduleSendSound(audio: BaseAudioContext, out: AudioNode, t0: number, wordCount: number) {
  const timing = sendTiming(wordCount);
  timing.wordTimes.forEach((time, index) => schedulePop(audio, out, t0 + time, WORD_NOTES[index], 0.55));
  GATHER_NOTES.forEach((note, index) => schedulePop(audio, out, t0 + timing.gather + index * 0.045, note, 0.2));

  const flight = timing.land - timing.launch;
  scheduleHyun(audio, out, t0 + timing.launch - 0.03, flight + 0.16, 0.2);
  scheduleWhoosh(audio, out, t0 + timing.launch, flight * 1.3, 2.4);
  schedulePop(audio, out, t0 + timing.launch + flight * 0.44, 60, 0.55);

  schedulePop(audio, out, t0 + timing.land, 60, 0.8);
  for (const [delay, note] of LAND_NOTES) schedulePop(audio, out, t0 + timing.land + delay, note, 0.5);
  schedulePiano(audio, out, t0 + timing.land + 0.26, 84, 0.16);
  schedulePop(audio, out, t0 + timing.land + 0.46, 84, 0.3);
}

/** ハ長調ペンタトニックの音（ド・レ・ミ・ソ・ラ）。上へ n 段たどる（負なら下へ）。 */
const PENTATONIC = [0, 2, 4, 7, 9];
export function pentatonicUp(note: number, steps: number): number {
  const octave = Math.floor((note - 60) / 12);
  const index = PENTATONIC.indexOf((((note - 60) % 12) + 12) % 12);
  if (index < 0) throw new Error(`ペンタトニックの外の音です: ${note}`);
  const position = index + steps;
  const size = PENTATONIC.length;
  return 60 + 12 * (octave + Math.floor(position / size)) + PENTATONIC[((position % size) + size) % size];
}

/** 声が1区切り固まるたびの「ポン」の音階。言葉の音（WORD_NOTES）を2オクターブに延ばしたもの */
export const COMMIT_NOTES = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93];
const COMMIT_VOLUME = 0.22;
/** この段から、上に小さく音を重ねて豊かにする */
const COMMIT_RICH_FROM = 6;

/**
 * step 段目（1 から数える）のポンで鳴らす音。段ごとに1つ上がり、上端で留まる。
 * 6段目からは、ペンタトニックで3つ上（多くは5度上）を小さく重ねる。
 */
export function commitPopNotes(step: number): { note: number; volume: number }[] {
  const index = Math.min(Math.max(Math.floor(step), 1), COMMIT_NOTES.length) - 1;
  const note = COMMIT_NOTES[index];
  const notes = [{ note, volume: COMMIT_VOLUME }];
  if (index + 1 >= COMMIT_RICH_FROM) notes.push({ note: pentatonicUp(note, 3), volume: COMMIT_VOLUME * 0.4 });
  return notes;
}

export function scheduleCommitPop(audio: BaseAudioContext, out: AudioNode, at: number, step: number) {
  for (const { note, volume } of commitPopNotes(step)) schedulePop(audio, out, at, note, volume);
}

/** とどけるの段。0＝光らない、3 がいちばん */
export type DeliverLevel = 0 | 1 | 2 | 3;

const CHORD_VOLUME = 0.3;
const CHORD_GAP = 0.06;

/**
 * とどけるの段が上がった瞬間の締めの和音（分散和音、0.06 秒ずつ）。段が上がるほど豊かになる。
 * 段1＝ド・ソ、段2＝ド・ミ・ソ、段3＝ド・ミ・ソ・ドのあと、高いドをもう一度（主音に落ち着く）。
 */
export function readyChordNotes(level: DeliverLevel): { delay: number; note: number; volume: number }[] {
  const chords: Record<DeliverLevel, number[]> = { 0: [], 1: [72, 79], 2: [72, 76, 79], 3: [72, 76, 79, 84] };
  const notes = chords[level].map((note, index) => ({ delay: index * CHORD_GAP, note, volume: CHORD_VOLUME }));
  if (level === 3) notes.push({ delay: notes.length * CHORD_GAP, note: 84, volume: CHORD_VOLUME });
  return notes;
}

export function scheduleReadyChord(audio: BaseAudioContext, out: AudioNode, at: number, level: DeliverLevel) {
  for (const { delay, note, volume } of readyChordNotes(level)) schedulePop(audio, out, at + delay, note, volume);
}

// 0-2m：声が固まる音は、話している間は鳴らさず、指を離したあとにまとめて鳴らす

/** 話し終えたあとの音の数の上限（ド〜1オクターブ上のドの6音） */
export const COMMIT_RUN_MAX = 6;
/** 音と音の間（秒）。短く続けて「ポンポンポン…」にする */
export const COMMIT_RUN_GAP = 0.1;
const COMMIT_RUN_VOLUME = 0.14;

/** とどけるの締めの和音（いちばん豊かな段）の最後の音。話し終えたあとの音はここへ向かって上がる */
export const COMMIT_RUN_TARGET = readyChordNotes(3).slice(-1)[0].note;

/**
 * 話し終えたあとに続けて鳴らす音。count はその会話で話した回数。
 * 1回目は1つ、話すたびに1つ増え、COMMIT_RUN_MAX で止まる。
 * ペンタトニックを下から上がり、最後の音はいつも COMMIT_RUN_TARGET（とどけるの最後の音）。
 * 音量は小さく、後ろほどわずかに大きくして、最後の音で落ち着かせる。
 */
export function commitRunNotes(count: number): { delay: number; note: number; volume: number }[] {
  const length = Math.min(Math.max(Math.floor(Number.isFinite(count) ? count : 1), 1), COMMIT_RUN_MAX);
  return Array.from({ length }, (_, index) => {
    const lift = length === 1 ? 1 : 0.8 + (0.2 * index) / (length - 1);
    return {
      delay: index * COMMIT_RUN_GAP,
      note: pentatonicUp(COMMIT_RUN_TARGET, index - (length - 1)),
      volume: COMMIT_RUN_VOLUME * lift,
    };
  });
}

/**
 * やわらかい鈴やマリンバ寄りの音。木琴（schedulePop）より立ち上がりを丸く、余韻を少し長くする。
 * サイン波の基音に、小さな倍音（2倍と4倍）を少しだけ重ね、短く減衰させる。
 */
export function scheduleChime(audio: BaseAudioContext, out: AudioNode, at: number, note: number, volume: number) {
  const partials: [number, number, number][] = [
    [1, 1, 0.22],
    [2, 0.12, 0.1],
    [4, 0.05, 0.05],
  ];
  for (const [ratio, level, decay] of partials) {
    const tone = audio.createOscillator();
    tone.type = "sine";
    tone.frequency.value = hz(note) * ratio;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume * level, at + 0.008);
    gain.gain.setTargetAtTime(0, at + 0.008, decay);
    tone.connect(gain).connect(out);
    tone.start(at);
    tone.stop(at + 1);
  }
}

export function scheduleCommitRun(audio: BaseAudioContext, out: AudioNode, at: number, count: number) {
  for (const { delay, note, volume } of commitRunNotes(count)) scheduleChime(audio, out, at + delay, note, volume);
}

/** 段は上がるだけで下げない。下げてよいのは、届けたときと命や安全のとき（呼び出し側で 0 にする） */
export function raiseLevel(current: DeliverLevel, incoming: number): DeliverLevel {
  const next = Math.min(3, Math.max(0, Math.floor(Number.isFinite(incoming) ? incoming : 0)));
  return Math.max(current, next) as DeliverLevel;
}
