import type { ReactNode } from "react";
import { BackLink } from "../BackLink";
import "./ui.css";

/**
 * 奥の画面の共通の外枠（0-1q）。左上に「‹ 行き先」、見出し、ひとこと、の順にそろえる。
 * 中身は下から 8px、標準のイージングで 200ms で入る（設計書 §1 原則7、§2-3）。動きを減らす設定では動かさない。
 * 下のタブのナビも「デモ用：使う人」も置かない。中身は画面ごとスクロールし、入れ物の中だけでスクロールさせない。
 */
export function PageShell({
  back,
  title,
  lead,
  className,
  children,
}: {
  /** 戻る先と、その画面の名前（例：{ href: "/minna", label: "みんな" }） */
  back: { href: string; label: string };
  title: ReactNode;
  lead?: ReactNode;
  /** 画面ごとの見た目の名前（前からのクラスを残すため） */
  className?: string;
  children?: ReactNode;
}) {
  return (
    <main className={["home", "page-shell", className].filter(Boolean).join(" ")}>
      <header className="page-head">
        <BackLink href={back.href}>{back.label}</BackLink>
        <h1>{title}</h1>
        {lead && <p className="page-lead">{lead}</p>}
      </header>
      {children}
    </main>
  );
}
