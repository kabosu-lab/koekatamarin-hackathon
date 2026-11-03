import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countContributions, getAvatar } from "@/lib/avatar";
import { getDatabase } from "@/lib/db";
import { Avatar } from "../../Avatar";

export const metadata: Metadata = { title: "プロフィール｜コエカタ" };
export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDatabase();
  const person = db.prepare("SELECT name, label, public_profile FROM people WHERE id = ?").get(id) as
    | { name: string; label: string; public_profile: string }
    | undefined;
  if (!person) notFound();
  const avatar = getAvatar(db, id);
  const counts = countContributions(db, id);

  return (
    <main className="home">
      <h1>{person.name}</h1>
      <p>{person.label}</p>
      <section className="card partner" aria-label="相棒">
        <Avatar image={avatar.image} alt={`${person.name}さんの相棒`} />
        <p>{person.public_profile || "プロフィールはまだありません。"}</p>
      </section>
      <section className="card" aria-label="応援とコメント">
        <p className="counts">
          <span>応援 {counts.cheers}</span>
          <span>コメント {counts.comments}</span>
        </p>
        <p className="muted">人と比べるものではありません。</p>
      </section>
      <p className="staff-link">
        <Link href="/minna">みんなへもどる</Link>
      </p>
    </main>
  );
}
