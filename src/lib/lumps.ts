const MAX_WORDS = 5;
const MIN_CHARS = 3;
const MAX_CHARS = 8;
/** 言葉が出る拍。「ぽ、ぽ、ぽぽ、ぽ」と4つ目だけ詰まる */
const RHYTHM = [0, 1, 2, 2.5, 3.5];
const BEAT = 0.16;

/** 話した言葉を、ポポポと出す短いかたまりに分ける。「が」のような短い語は前の語に付ける。 */
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

/** 動きと音を合わせるための時刻（秒）。言葉が出る → 固まる → 文章の箱に入って開く → 外へ飛ぶ → 届く。 */
export function sendTiming(wordCount: number) {
  const wordTimes = RHYTHM.slice(0, wordCount).map((beat) => beat * BEAT);
  const gather = (wordTimes[wordTimes.length - 1] ?? 0) + 0.2;
  const enter = gather + 0.2;
  const open = enter + 0.12;
  const launch = open + 0.5;
  const land = launch + 0.42;
  return { wordTimes, gather, enter, open, launch, land, end: land + 1.1 };
}
