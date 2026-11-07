import type { PostKind } from "./seed-data";

/**
 * 0-3b：投稿の件名の頭に付ける種類の札。押すと次の札に回る順に並べる。
 * DB の kind（PostKind）は今の5つのまま広げず、札から決める。札そのものは件名の頭に残るので、あとから読み分けられる。
 */
export const SUBJECT_TAGS = [
  { label: "うまくいった", kind: "report" },
  { label: "困りごと", kind: "trouble" },
  { label: "聞きたい", kind: "worry" },
  // notice は学校からのお知らせ（育ちや桜の数に入れない）なので、本人の告知は report にする
  { label: "お知らせ", kind: "report" },
  { label: "頑張り", kind: "effort" },
  // 0-3d：ここから3つはサンクスカードの札。カードかどうかは札で見分ける（kind は report のまま）
  { label: "ありがとう", kind: "report" },
  { label: "がんばったね", kind: "report" },
  { label: "おめでとう", kind: "report" },
] as const satisfies readonly { label: string; kind: PostKind }[];

export type SubjectTag = (typeof SUBJECT_TAGS)[number]["label"];

/** 0-3d：サンクスカードの札と、カードの種類（封筒の絵柄、thanks-kind.ts の ThanksKind と同じ） */
export const CARD_TAGS = { ありがとう: "thanks", がんばったね: "effort", おめでとう: "congrats" } as const;
export type CardKind = (typeof CARD_TAGS)[keyof typeof CARD_TAGS];

/** 件名の札がサンクスカードの札なら、カードの種類。ふつうの投稿なら null */
export function cardKind(subject: string | null | undefined): CardKind | null {
  const tag = subject ? splitSubject(subject).tag : null;
  return tag && Object.hasOwn(CARD_TAGS, tag) ? CARD_TAGS[tag as keyof typeof CARD_TAGS] : null;
}

/**
 * SQL で「カードの投稿ではない」を表す条件（cardKind と同じ見分け方）。
 * カードは「お願い」の仕組み（asked_person_id）に乗るので、受信箱・パス・ゴールなどの数から外すのに使う
 */
export function notCardSql(alias = "p"): string {
  const tags = Object.keys(CARD_TAGS).map((tag) => `coalesce(${alias}.subject, '') LIKE '【${tag}】%'`);
  return `NOT (${tags.join(" OR ")})`;
}

/** カードの種類から札 */
export function cardTag(kind: CardKind): SubjectTag {
  return kind === "congrats" ? "おめでとう" : kind === "effort" ? "がんばったね" : "ありがとう";
}

/** 件名の長さの上限（20字前後の目安より少し余裕を持たせる） */
export const MAX_SUBJECT_LENGTH = 60;

const TAG_PATTERN = /^\s*【([^】]*)】\s*/;

/** 種類から、札の初めの形を決める（Claude が札を付け忘れたとき） */
export function tagForKind(kind: PostKind): SubjectTag {
  if (kind === "trouble") return "困りごと";
  if (kind === "worry") return "聞きたい";
  if (kind === "notice") return "お知らせ";
  if (kind === "effort") return "頑張り";
  return "うまくいった";
}

export function kindOfTag(tag: SubjectTag): PostKind {
  return SUBJECT_TAGS.find((t) => t.label === tag)?.kind ?? "report";
}

/** 件名を札と残りの言葉に分ける。札がない・知らない札なら tag は null */
export function splitSubject(subject: string): { tag: SubjectTag | null; title: string } {
  const match = TAG_PATTERN.exec(subject);
  if (!match) return { tag: null, title: subject.trim() };
  const tag = SUBJECT_TAGS.find((t) => t.label === match[1].trim())?.label ?? null;
  return tag ? { tag, title: subject.slice(match[0].length).trim() } : { tag: null, title: subject.trim() };
}

export function joinSubject(tag: SubjectTag, title: string): string {
  return `【${tag}】${title.trim()}`;
}

/** 札の次の札（最後の次は最初） */
export function nextTag(tag: SubjectTag): SubjectTag {
  const index = SUBJECT_TAGS.findIndex((t) => t.label === tag);
  return SUBJECT_TAGS[(index + 1) % SUBJECT_TAGS.length].label;
}

/** 件名を作らない下書き（歩きながらなど）のための件名。種類の札と、本文の最初の一文の頭 */
export function subjectFromText(text: string, kind: PostKind): string {
  const first = text.trim().split(/[\n。！？!?]/)[0]?.trim() ?? "";
  if (!first) return "";
  return joinSubject(tagForKind(kind), first.length > 20 ? `${first.slice(0, 20)}…` : first);
}

/**
 * 件名を整える。札がなければ種類から付ける。改行は空白にし、長すぎれば切る。空なら空のまま。
 * 返す kind は札から決めたもの（札と種類がずれないように）。
 */
export function normalizeSubject(subject: string, kind: PostKind): { subject: string; kind: PostKind } {
  const flat = subject.replace(/\s+/g, " ").trim();
  if (flat === "") return { subject: "", kind };
  const { tag, title } = splitSubject(flat);
  const chosen = tag ?? tagForKind(kind);
  if (title === "") return { subject: "", kind };
  const joined = joinSubject(chosen, title);
  return { subject: joined.slice(0, MAX_SUBJECT_LENGTH), kind: tag ? kindOfTag(tag) : kind };
}
