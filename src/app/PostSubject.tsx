/** 0-3b：投稿の件名（頭に種類の札）。あるときだけ、本文の上に太字で1行 */
export function PostSubject({ subject, className }: { subject?: string | null; className?: string }) {
  if (!subject) return null;
  return (
    <p className={className ? `post-subject ${className}` : "post-subject"}>
      <strong>{subject}</strong>
    </p>
  );
}
