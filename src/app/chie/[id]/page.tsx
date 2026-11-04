import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getKnowledge } from "@/lib/knowledge";
import { KnowledgeActions } from "./KnowledgeActions";

export const metadata: Metadata = { title: "校内の知恵｜こえかた" };
export const dynamic = "force-dynamic";

const STATE = { waiting: "確認待ち", ok: "確認済み", removed: "外してほしいそうです" };

export default async function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer } = await getViewer();
  const item = getKnowledge(getDatabase(), viewer.id, id);
  if (!item) notFound();

  return (
    <main className="home chie">
      <h1>{item.title}</h1>
      {item.status === "confirming" && <p className="notice">まだ確認中で、関わる人にしか見えていません。</p>}
      {item.status === "withdrawn" && <p className="notice">取り下げました。あなたにしか見えていません。</p>}

      <section className="card" aria-label="知恵の本文">
        <p className="chie-body">{item.body}</p>
        <p className="muted">やった人の経験です。公式の規程ではありません。</p>
        {item.researchedWithAi && <p className="ai-mark">AI と調べました</p>}
        <p className="muted">
          {item.helpedCount > 0 && `${item.helpedCount}人が役に立ったと言っています。`}
          {item.openFixCount > 0 && `直したほうがいい指摘が${item.openFixCount}件。`}
        </p>
        <p>
          <Link href={`/teams?channel=${item.channelId}#post-${item.sourcePostId}`}>元の投稿を見る</Link>
        </p>
      </section>

      <section className="card" aria-label="言葉を使われた人">
        <h2>言葉を使われた人</h2>
        <ul className="chie-list">
          {item.contributors.map((person) => (
            <li key={person.id}>
              <Link href={`/people/${person.id}`}>{person.name}さん</Link>（{person.label}）
              {item.status === "confirming" && `・${STATE[person.state]}`}
              {item.status === "shared" && person.id !== viewer.id && item.askableIds.includes(person.id) && (
                <>
                  {" "}
                  <Link href={`/?ask=${person.id}`}>聞いてみる？</Link>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <KnowledgeActions key={`${viewer.id}-${item.id}`} item={item} viewerId={viewer.id} />

      <p className="staff-link">
        <Link href="/chie">校内の知恵へもどる</Link>
      </p>
    </main>
  );
}
