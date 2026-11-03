const MAX_WORDS = 5;
const MIN_CHARS = 3;
const MAX_CHARS = 8;
const POP_GAP = 0.12;

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

/** 動きと音を合わせるための時刻（秒）。 */
export function sendTiming(wordCount: number) {
  const gather = wordCount * POP_GAP + 0.08;
  const launch = gather + 0.22;
  const land = launch + 0.42;
  return { popGap: POP_GAP, gather, launch, land, end: land + 1.1 };
}
