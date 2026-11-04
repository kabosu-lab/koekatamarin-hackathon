/** 人から贈られ、本人が選んだ肩書き。名前の横に出す。 */
export function PersonTitle({ title }: { title?: string | null }) {
  return title ? <span className="person-title">{title}</span> : null;
}
