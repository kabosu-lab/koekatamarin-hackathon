import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getKnowledge } from "@/lib/knowledge";
import { noteAskSuggested, noteFoundKnowledge } from "@/lib/trophy-log";
import { KnowledgeActions } from "./KnowledgeActions";
import { KnowledgeNotes } from "./KnowledgeNotes";
import { AttachmentPreview } from "../../AttachmentPreview";

import { PageShell } from "@/app/ui/PageShell";
export const metadata: Metadata = { title: "校内の知恵｜こえかた" };
export const dynamic = "force-dynamic";

const STATE = { waiting: "確認待ち", ok: "確認済み", removed: "外してほしいそうです" };

export default async function KnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const { viewer } = await getViewer();
  const db = getDatabase();
  const item = getKnowledge(db, viewer.id, id);
  if (!item) notFound();
  // トロフィーのための操作の記録。探して開いたことと、パートナーが「聞いてみる？」と案内した相手だけを残す
  const now = new Date();
  if (from === "find") noteFoundKnowledge(db, viewer.id, item.id, now);
  if (item.status === "shared") noteAskSuggested(db, viewer.id, item.askableIds.filter((personId) => personId !== viewer.id), now);

  return (
    <PageShell back={{ href: "/chie", label: "校内の知恵" }} title={item.title} className="chie">
      {item.status === "confirming" && <p className="notice">まだ確認中で、関わる人にしか見えていません。</p>}
      {item.status === "withdrawn" && <p className="notice">取り下げました。あなたにしか見えていません。</p>}

      <section className="card" aria-label="知恵の本文">
        <p className="chie-body">{item.body}</p>
        <p className="muted">やった人の経験です。公式の規程ではありません。</p>
        {item.attachment && <AttachmentPreview attachment={item.attachment} />}

        {item.researchedWithAi && <p className="ai-mark">AI と調べました</p>}
        {item.likeCount > 0 && <p className="muted">{item.likeCount}人がいいねしました。</p>}
        <p>
          <Link href={`/teams?channel=${item.channelId}#post-${item.sourcePostId}`}>元の投稿を見る</Link>
          {item.askInChannel && (
            <>
              {" "}
              <Link href={`/teams?channel=${item.channelId}`}>チャネルをのぞいてみる？</Link>
            </>
          )}
        </p>
      </section>

      {item.canAddNote && <KnowledgeNotes key={`notes-${viewer.id}-${item.id}`} item={item} viewerId={viewer.id} />}

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
    </PageShell>
  );
}
