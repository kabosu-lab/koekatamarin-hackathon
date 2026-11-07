/**
 * パートナーが「作っている人に届けてもいい？」と聞いたあとの、本人の返事がいいよかを見る（0-2h (3)）。
 * 迷ったら送らない側に倒す：断りの言葉が少しでもあれば送らず、長い返事は話の続きとみなして送らない。
 */
const MAX_CONSENT_LENGTH = 40;

/** 断り・保留。「いいえ」が「いい」に当たらないよう、先に見る */
const DECLINE =
  /いいえ|^いや|いやだ|いやや|嫌|やめ|やだ|だめ|ダメ|駄目|遠慮|結構|ちょっと|まだ|ないで|ないほう|ない方|もういい|しなくて|いらん|いらない|要らない|無理|むり|^no\b|^ng\b|^nope/i;

/** いいよ。頭にあるか、はっきり頼む言葉が入っているとき */
const AGREE =
  /^(はい|うん|ええ|いい|おk|ok|おけ|おっけ|オッケ|オーケ|どうぞ|もちろん|ぜひ|是非|了解|りょ|よろしく|yes|sure)|お願い|おねがい|届けて|とどけて|送って|おくって|いいよ|いいです|いいで|ええよ|ええで|かまわ|構わ/i;

export function isFeedbackConsent(text: string): boolean {
  const said = text
    .normalize("NFKC")
    .trim()
    .replace(/^[\s、。,.!?「」~〜ー…・]+/, "");
  if (!said || said.length > MAX_CONSENT_LENGTH) return false;
  if (DECLINE.test(said)) return false;
  return AGREE.test(said);
}

/** 断りの返事か。同意の判定と同じ言葉で見る（短い返事だけ） */
export function isFeedbackDecline(text: string): boolean {
  const said = text
    .normalize("NFKC")
    .trim()
    .replace(/^[\s、。,.!?「」~〜ー…・]+/, "");
  return said.length > 0 && said.length <= MAX_CONSENT_LENGTH && DECLINE.test(said);
}

/** パートナーの直前の返事が「作っている人に届けてもいい？」と聞いていたか */
const ASKED_TO_DELIVER = /(届け|とどけ|伝え|送っ)て(も|よ)?(いい|良い|よい|大丈夫|かま|構)|(届け|とどけ)ましょうか/;
const MAKERS = /作って(い|る)|作った人|作り手|開発/;

/** 同意や頼みの言葉。これを除いて残る分が、感想の中身 */
const CONSENT_WORDS =
  /(届け|とどけ|伝え|送っ)て(も|よ)?(ください|下さい|ほしい|欲しい|もらえ(ます|る)?|もらって|もらっていい|くれる|くれ|おいて|いい|良い)?|お願い(します)?|おねがい|いいよ|いいです|ですか|ますか|はい|うん|ええ|どうぞ|もちろん|ぜひ|[、。,.!?！？\s~〜ー…「」]/g;

/** 同意の言葉を除いて、この字数が残れば、感想の中身も入っているとみなす（「ボタンが小さいって届けて」など） */
const MIN_CONTENT_LENGTH = 5;

type Turn = { role: "user" | "assistant"; content: string };

/**
 * 話の中の感想（0-2h (3)・0-3l (2)）で、作っている人に届ける本人の言葉を決める。届けないなら null。
 * `marked` は、パートナーが「本人が届けることに同意した」と判断した印（[[感想を届ける]]）が付いたか。
 * - 断りの返事なら、印があっても届けない
 * - パートナーが届けてよいか聞いたあとに本人が同意したら、印がなくても、その前の本人の言葉を届ける
 * - 聞いていなくても印があれば、短い同意ならその前の本人の言葉、感想を含む長い言葉ならその言葉を届ける
 * 名前や人物は扱わない。本人の言葉だけを返す。
 */
export function talkFeedbackToDeliver(history: readonly Turn[], text: string, marked: boolean): string | null {
  const now = text.trim();
  if (!now || isFeedbackDecline(now)) return null;
  const lastAt = history.findLastIndex((turn) => turn.role === "assistant");
  // 「先生に伝えてもいい？」など別の話と取り違えないよう、作っている人に向けた問いだけを見る
  const asked = lastAt >= 0 && ASKED_TO_DELIVER.test(history[lastAt].content) && MAKERS.test(history[lastAt].content);
  const said = history
    .slice(0, Math.max(lastAt, 0))
    .findLast((turn) => turn.role === "user")
    ?.content.trim();
  if (isFeedbackConsent(now)) {
    if (asked) return said || null;
    if (!marked) return null;
    const content = now.normalize("NFKC").replace(CONSENT_WORDS, "");
    // パートナーが届けたと言う以上、前の言葉がなければ今の言葉を届ける
    return content.length >= MIN_CONTENT_LENGTH ? now : said || now;
  }
  return marked ? now : null;
}
