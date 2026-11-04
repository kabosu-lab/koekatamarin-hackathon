/** 最初の約束を、本人が一度読んだかどうか。人物ごとに分ける（デモで人を切り替えるため）。 */
export function promiseCookieName(personId: string): string {
  return `koekata_promise_${personId}`;
}

export const PROMISE_FULL =
  "ここでの話はあなただけのものです。ただし、命や安全に関わるときは、話した言葉ではなく要点だけを相談室の先生に伝えます。";

export const PROMISE_SHORT = "話はあなただけのもの。命や安全に関わるときは、要点だけ相談室の先生へ。";
