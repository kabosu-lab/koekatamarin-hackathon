import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { listKnowledgeTasks, listSharedKnowledge } from "@/lib/knowledge";
import { PersonSwitcher } from "../PersonSwitcher";
import { KnowledgeFinder } from "./KnowledgeFinder";
import { KnowledgeTasks } from "./KnowledgeTasks";

export const metadata: Metadata = { title: "校内の知恵｜こえかた" };
export const dynamic = "force-dynamic";

export default async function ChiePage() {
  const { viewer, people } = await getViewer();
  const db = getDatabase();
  const items = listSharedKnowledge(db, viewer.id);

  return (
    <main className="home chie">
      <header>
        <h1>校内の知恵</h1>
        <p>みんなのやり取りから生まれた知恵です。言葉を使われた本人たちが確かめたものだけが広がります。</p>
        <p className="muted">やった人の経験です。公式の規程ではありません。古くなったら、みんなで直せます。</p>
        <PersonSwitcher viewerId={viewer.id} people={people} />
      </header>
      <KnowledgeFinder key={viewer.id} viewerName={viewer.name} />
      <KnowledgeTasks tasks={listKnowledgeTasks(db, viewer.id)} />
      <section className="card" aria-label="広がっている知恵">
        <h2>広がっている知恵</h2>
        {items.length === 0 ? (
          <p>まだ知恵はありません。校内チャネルのやり取りから残せます。</p>
        ) : (
          <ul className="chie-list">
            {items.map((item) => (
              <li key={item.id}>
                <Link href={`/chie/${item.id}`}>
                  <strong>{item.title}</strong>
                </Link>
                <p className="chie-body">{item.body}</p>
                <p className="muted">{item.people.map((person) => `${person.name}さん`).join("、")}の言葉</p>
                {item.likeCount > 0 && <p className="muted">{item.likeCount}人がいいねしました。</p>}
                {item.shownNotes.map((note) => (
                  <p key={note.id} className="chie-note">
                    {note.body}（{note.authorName}さんの注釈）
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="staff-link">
        <Link href="/minna">みんなへもどる</Link>
      </p>
    </main>
  );
}
