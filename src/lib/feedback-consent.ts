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
