import Link from "next/link";

/**
 * もどるは、どの画面でも左上の同じ場所に、同じ形「‹ 行き先」で置く（「‹ 履歴と設定」と同じ形）。
 * 前の書き方「みんなへもどる」を渡されても、行き先の名前だけを出す。
 */
export function BackLink({ href, children }: { href: string; children: string }) {
  const place = children.replace(/へもどる$/, "").replace(/^もどる$/, "話す");
  return (
    <Link className="back-link" href={href}>
      ‹ {place}
    </Link>
  );
}
