import { cardKind } from "@/lib/subject";

/** 0-3b：投稿の件名（頭に種類の札）。あるときだけ、本文の上に太字で1行。0-3d：カードには花びらの印 */
export function PostSubject({ subject, className }: { subject?: string | null; className?: string }) {
  if (!subject) return null;
  return (
    <p className={className ? `post-subject ${className}` : "post-subject"}>
      {cardKind(subject) && <span className="card-mark" role="img" aria-label="サンクスカード" />}
      <strong>{subject}</strong>
    </p>
  );
}

/** 0-3d：カードの投稿の外側に付ける印（縁は CSS の [data-card]） */
export function cardAttr(subject: string | null | undefined): { "data-card"?: string } {
  const kind = cardKind(subject);
  return kind ? { "data-card": kind } : {};
}
