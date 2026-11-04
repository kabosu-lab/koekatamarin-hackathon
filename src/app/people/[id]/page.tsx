import { wornTitle } from "@/lib/titles";
import { PersonTitle } from "../../PersonTitle";
import { cookies } from "next/headers";
import { readAppearance } from "@/lib/appearance";
import { showsRewards } from "@/lib/rewards-view";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countContributions, getAvatar } from "@/lib/avatar";
import { getDatabase } from "@/lib/db";
import { listPublicRibbons } from "@/lib/ribbons";
import { Avatar } from "../../Avatar";

import { BackLink } from "@/app/BackLink";
export const metadata: Metadata = { title: "プロフィール｜こえかた" };
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
  const store = await cookies();
  const rewards = showsRewards(readAppearance((name) => store.get(name)?.value));
  const ribbons = rewards ? listPublicRibbons(db, id) : [];

  return (
    <main className="home">
      <BackLink href="/minna">みんなへもどる</BackLink>
      <h1>{person.name}</h1>
      <PersonTitle title={wornTitle(db, id)} />
      <p>{person.label}</p>
      <section className="card partner" aria-label="相棒">
        {rewards && <Avatar image={avatar.image} alt={`${person.name}さんの相棒`} />}
        <p>{person.public_profile || "プロフィールはまだありません。"}</p>
      </section>
      {ribbons.length > 0 && (
        <section className="card ribbons" aria-label="リボン">
          <h2>リボン</h2>
          <ul className="ribbon-list">
            {ribbons.map((ribbon) => (
              <li key={ribbon.id}>
                <span className="ribbon-mark" aria-hidden="true" />
                <div>
                  <strong>{ribbon.name}</strong>
                  <small>{ribbon.description}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card" aria-label="応援とコメント">
        <p className="counts">
          <span>応援 {counts.cheers}</span>
          <span>コメント {counts.comments}</span>
        </p>
        <p className="muted">人と比べるものではありません。</p>
      </section>
    </main>
  );
}
