"use client";

import Link from "next/link";
import { THANKS_KINDS, type ThanksKind } from "@/lib/thanks-kind";
import { Icon } from "../Icon";
import "./thanks.css";

export type ThanksPerson = { id: string; name: string; label: string };

/** 言葉から読み取った絵柄。種類を選ぶ欄は置かない（0-2j(4)） */
export function ThanksKindMark({ kind }: { kind: ThanksKind }) {
  const { label, icon } = THANKS_KINDS[kind];
  return (
    <span className="thanks-kind" data-kind={kind}>
      <Icon name={icon} />
      {label}
    </span>
  );
}

/**
 * 助けてもらった場所に置く「ありがとう」（0-2j(1)）。
 * 0-3d：サンクスカードはふつうの投稿の1つの種類になったので、押すと話す画面でその人へのカードの下書きが始まる（/?thanks=<人のID>）。
 */
export function ThanksEntry({
  person,
  label = "ありがとう",
  reply = false,
}: {
  person: ThanksPerson;
  label?: "ありがとう" | "おめでとう" | "頑張ってたね";
  /** 0-3a：届いたカードへの「ありがとうを返す」 */
  reply?: boolean;
}) {
  const icon = label === "おめでとう" ? "star" : label === "頑張ってたね" ? "flag" : "heart";
  return (
    <Link
      href={`/?thanks=${encodeURIComponent(person.id)}`}
      className="thanks-entry button-link"
      aria-label={reply ? `${person.name}さんにありがとうを返す` : `${person.name}さんに${label}を送る`}
    >
      <Icon name={icon} />
      <span>{reply ? "ありがとうを返す" : label}</span>
    </Link>
  );
}
