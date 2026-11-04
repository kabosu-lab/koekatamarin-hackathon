import Link from "next/link";
import { Icon } from "./Icon";

/** もどるは、どの画面でも左上の同じ場所に置く。 */
export function BackLink({ href, children }: { href: string; children: string }) {
  return (
    <Link className="back-link" href={href}>
      <Icon name="back" />
      {children}
    </Link>
  );
}
