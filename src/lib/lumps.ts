const MAX_WORDS = 5;
const MIN_CHARS = 3;
const MAX_CHARS = 8;
/** 言葉が出る間隔（秒）。少しずつ固まり、固まる速さが加速していく */
const GAPS = [0.28, 0.2, 0.14, 0.1];

/** 話した言葉を、ひとつずつ出す短いかたまりに分ける。「が」のような短い語は前の語に付ける。 */
export function splitIntoWords(text: string): string[] {
  const words: string[] = [];
  for (const { segment, isWordLike } of new Intl.Segmenter("ja", { granularity: "word" }).segment(text)) {
    if (!isWordLike) continue;
    const last = words[words.length - 1];
    if (last !== undefined && segment.length < MIN_CHARS && last.length + segment.length <= MAX_CHARS) {
      words[words.length - 1] = last + segment;
    } else {
      words.push(segment.slice(0, MAX_CHARS));
    }
  }
  return words.slice(0, MAX_WORDS);
}

/** 短い文でも速くなるよう、加速の後ろの部分を使う。2語のときだけ速すぎないようにする。 */
function gapsFor(wordCount: number): number[] {
  if (wordCount <= 1) return [];
  if (wordCount === 2) return [GAPS[1]];
  return GAPS.slice(GAPS.length - Math.min(wordCount - 1, GAPS.length));
}

/**
 * 動きと音を合わせるための時刻（秒）。
 * 言葉が出て真ん中へ吸い込まれる → 固まる → ためる → ヒューンと飛ぶ → 届く。
 */
export function sendTiming(wordCount: number) {
  const gaps = gapsFor(wordCount);
  const wordTimes = [0];
  for (const gap of gaps) wordTimes.push(Number((wordTimes[wordTimes.length - 1] + gap).toFixed(3)));
  if (wordCount === 0) wordTimes.length = 0;
  // 言葉は次の言葉が出るころに吸い込まれる。加速するほど短くなる
  const wordDurations = wordTimes.map((_, index) => Number(((gaps[index] ?? 0.1) + 0.06).toFixed(3)));
  const absorbTimes = wordTimes.map((time, index) => Number((time + wordDurations[index]).toFixed(3)));
  const gather = absorbTimes[absorbTimes.length - 1] ?? 0.1;
  const launch = Number((gather + 0.26).toFixed(3));
  const land = Number((launch + 0.36).toFixed(3));
  return { wordTimes, wordDurations, absorbTimes, gather, launch, land, end: Number((land + 0.9).toFixed(3)) };
}

export type SendTiming = ReturnType<typeof sendTiming>;

type Frame = { offset: number; transform: string; opacity: number };

/** 飛ぶ道すじ。尾を引くように弧を描き、後ろほど速くなる（画面の大きさは px で渡す）。 */
export function flightPath(width: number, height: number, steps = 14) {
  const start = { x: 0, y: 0 };
  const control = { x: -0.42 * width, y: -0.34 * height };
  const stop = { x: 0.46 * width, y: -0.9 * height };
  return Array.from({ length: steps + 1 }, (_, index) => {
    const linear = index / steps;
    const t = linear * linear;
    const u = 1 - t;
    const x = u * u * start.x + 2 * u * t * control.x + t * t * stop.x;
    const y = u * u * start.y + 2 * u * t * control.y + t * t * stop.y;
    const dx = 2 * u * (control.x - start.x) + 2 * t * (stop.x - control.x);
    const dy = 2 * u * (control.y - start.y) + 2 * t * (stop.y - control.y);
    return { progress: linear, x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI + 90 };
  });
}

const round = (value: number) => Number(value.toFixed(4));

/** かたまりの動き：言葉を吸うたびに大きくなり、つぶれてためてから、伸びて飛ぶ。 */
export function lumpFrames(timing: SendTiming, width: number, height: number): Frame[] {
  const total = timing.land;
  const frames: Frame[] = [{ offset: 0, transform: "scale(0.2)", opacity: 0 }];
  const count = timing.absorbTimes.length;
  timing.absorbTimes.forEach((time, index) => {
    const size = 0.42 + (0.58 * (index + 1)) / count;
    frames.push({ offset: round((time - 0.02) / total), transform: `scale(${round(size * 0.92)})`, opacity: 1 });
    frames.push({ offset: round((time + 0.04) / total), transform: `scale(${round(size * 1.14)})`, opacity: 1 });
  });
  frames.push({ offset: round((timing.gather + 0.08) / total), transform: "scale(1)", opacity: 1 });
  frames.push({ offset: round((timing.launch - 0.02) / total), transform: "scale(1.3, 0.68)", opacity: 1 });
  for (const point of flightPath(width, height)) {
    const offset = round((timing.launch + (timing.land - timing.launch) * point.progress) / total);
    const stretch = 1 + 0.9 * Math.sin(Math.min(1, point.progress * 1.4) * Math.PI);
    const size = 1 - 0.72 * point.progress;
    frames.push({
      offset,
      transform: `translate(${round(point.x)}px, ${round(point.y)}px) rotate(${round(point.angle)}deg) scale(${round(size / Math.sqrt(stretch))}, ${round(size * stretch)})`,
      opacity: point.progress === 1 ? 0 : 1,
    });
  }
  return frames;
}

/** 尾：同じ道すじを少し遅れて小さく追う。 */
export function trailFrames(timing: SendTiming, width: number, height: number, order: number): { frames: Frame[]; delay: number; duration: number } {
  const flight = timing.land - timing.launch;
  const scale = 0.62 - order * 0.1;
  const fade = 0.6 - order * 0.1;
  return {
    delay: timing.launch + (order + 1) * 0.022,
    duration: flight,
    frames: flightPath(width, height).map((point) => ({
      offset: point.progress,
      transform: `translate(${round(point.x)}px, ${round(point.y)}px) scale(${round(scale * (1 - 0.6 * point.progress))})`,
      opacity: point.progress === 0 || point.progress === 1 ? 0 : round(fade),
    })),
  };
}

/** 本人の分身の動き：話すたびに弾み、息を吸い、吐き出して、届くと跳ねる。 */
export function speakerFrames(timing: SendTiming): { offset: number; transform: string }[] {
  const total = timing.end;
  const at = (time: number) => round(Math.min(1, Math.max(0, time / total)));
  const frames = [{ offset: 0, transform: "scale(1, 1)" }];
  timing.wordTimes.forEach((time, index) => {
    const nextWord = timing.wordTimes[index + 1] ?? timing.gather;
    frames.push({ offset: at(time + Math.min(0.05, (nextWord - time) / 3)), transform: "scale(1.09, 0.9)" });
    frames.push({ offset: at(Math.max(time + 0.08, nextWord - 0.01)), transform: "scale(1, 1)" });
  });
  frames.push({ offset: at(timing.launch - 0.02), transform: "scale(0.88, 1.16)" });
  frames.push({ offset: at(timing.launch + 0.05), transform: "scale(1.26, 0.78)" });
  frames.push({ offset: at(timing.launch + 0.2), transform: "scale(0.96, 1.05)" });
  frames.push({ offset: at(timing.land), transform: "scale(1, 1)" });
  frames.push({ offset: at(timing.land + 0.12), transform: "translateY(-1.6rem) scale(0.98, 1.04)" });
  frames.push({ offset: at(timing.land + 0.26), transform: "translateY(0) scale(1.08, 0.92)" });
  frames.push({ offset: at(timing.land + 0.4), transform: "scale(1, 1)" });
  frames.push({ offset: 1, transform: "scale(1, 1)" });
  // 時刻が重なっても、順番が戻らないようにする
  let previous = 0;
  return frames.map((frame) => {
    previous = Math.max(previous, frame.offset);
    return { ...frame, offset: previous };
  });
}
