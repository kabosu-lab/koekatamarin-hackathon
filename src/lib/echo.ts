/**
 * パートナーの読み上げを、マイクが本人の言葉として拾ったかを見分ける（0-3l）。
 * 読み上げた文と、聞き取った文の重なりで決める。漢字とかなの書き分けや聞き違いがあるので、完全には見分けられない。
 */

/** 句読点・空白・記号を除き、全角半角と大文字小文字をそろえる */
export function normalizeForEcho(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function bigrams(text: string): string[] {
  const result: string[] = [];
  for (let i = 0; i + 1 < text.length; i += 1) result.push(text.slice(i, i + 2));
  return result;
}

/** これより短い聞き取りは見分けない（「うん」「はい」などの本人の短い返事を捨てない） */
export const ECHO_MIN_CHARS = 4;
/** 聞き取った文の2字の並びのうち、これだけが読み上げた文にもあれば、読み上げを拾ったとみなす */
export const ECHO_COVERAGE = 0.65;

/** 聞き取った文の2字の並びのうち、読み上げた文にも出てくるものの割合（0〜1） */
export function echoCoverage(heard: string, spoken: string): number {
  const h = normalizeForEcho(heard);
  const s = normalizeForEcho(spoken);
  if (!h || !s) return 0;
  if (s.includes(h)) return 1;
  const pairs = bigrams(h);
  if (pairs.length === 0) return 0;
  const inSpoken = new Set(bigrams(s));
  return pairs.filter((pair) => inSpoken.has(pair)).length / pairs.length;
}

/** 聞き取った文が、直前に読み上げた文のどれかと大きく重なるか */
export function isEchoOf(heard: string, spokenTexts: readonly string[]): boolean {
  if (normalizeForEcho(heard).length < ECHO_MIN_CHARS) return false;
  return spokenTexts.some((spoken) => echoCoverage(heard, spoken) >= ECHO_COVERAGE);
}

/** 読み上げを、句点などの区切りで文に分ける。最初の一文を先に読み始めるため */
export function splitSentences(text: string): string[] {
  const sentences = (text.match(/[^。！？!?\n]+[。！？!?]*/g) ?? []).map((part) => part.trim()).filter(Boolean);
  return sentences.length > 0 ? sentences : text.trim() ? [text.trim()] : [];
}
