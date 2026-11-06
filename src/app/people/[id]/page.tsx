import { wornTitle } from "@/lib/titles";
import { getViewer } from "@/lib/current-person";
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
import { Sticker } from "../../Sticker";

import { PageShell } from "@/app/ui/PageShell";
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
    <PageShell back={{ href: "/minna", label: "みんな" }} title={person.name} lead={person.label}>
      <PersonTitle title={wornTitle(db, id)} />
      <section className="card partner" aria-label="パートナー">
        {rewards && <Avatar image={avatar.image} alt={`${person.name}さんのパートナー`} />}
        <p>{person.public_profile || "プロフィールはまだありません。"}</p>
      </section>
      {ribbons.length > 0 && (
        <section className="card ribbons" aria-label="トロフィー">
          <h2>トロフィー</h2>
          <ul className="trophy-profile-list">
            {ribbons.map((ribbon) => (
              <li key={ribbon.id}>
                <Sticker art={ribbon.art} />
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
    </PageShell>
  );
}
