/** 歩きながら話すときの、声での頼みごと。画面の部品からも読むので、ここにはサーバーの処理を入れない。 */
export type WalkCommand = "end" | "ask" | null;

const END = /(?:^|[\s。、！!？?])(?:おわり|終わり|終わります|おしまい)[。！!\s]*$/;
const ASK = /(?:どう思う|調べて|しらべて|壁打ちして|かべうちして)[？?。！!\s]*$/;

/** 話の最後の言葉から、頼みごとを読み取る。「今日で終わり」のように文の一部なら止めない。 */
export function detectCommand(text: string): WalkCommand {
  const trimmed = text.trim();
  if (END.test(trimmed)) return "end";
  return ASK.test(trimmed) ? "ask" : null;
}

/** 止めるための言葉は、話の中身に入れない。 */
export function withoutEndWord(text: string): string {
  return text.trim().replace(/[。、\s]*(?:おわり|終わり|終わります|おしまい)[。！!\s]*$/, "").trim();
}

const AIZUCHI = ["うんうん", "なるほど", "へえ", "そうなんや", "うん", "それで？"] as const;

/** Claude を呼ばない、短い定型の合いの手。同じ言葉を続けない。 */
export function aizuchiAt(count: number): string {
  return AIZUCHI[count % AIZUCHI.length];
}

/** 間が空いたと見なす長さと、合いの手の間隔。うるさくならないよう控えめに。 */
export const PAUSE_MS = 4000;
export const AIZUCHI_INTERVAL_MS = 45_000;
