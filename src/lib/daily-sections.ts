/**
 * 0-3g：日報の見出し。画面（クライアント）とサーバーの両方から使うので、ここにはサーバーだけの物を入れない。
 * words は【今日の一言】、ties は「人とのつながり」（記録から作る事実だけ。Claude に作らせない）。
 */
export type Section = "words" | "good" | "consult" | "tomorrow" | "ties";

export const SECTIONS: readonly Section[] = ["words", "good", "consult", "tomorrow", "ties"];

export const SECTION_LABELS: Record<Section, string> = {
  words: "今日の一言",
  good: "うまくいったこと",
  consult: "相談したいこと（管理職の方へ）",
  tomorrow: "明日やること",
  ties: "人とのつながり",
};
