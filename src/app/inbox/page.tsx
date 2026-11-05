import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { countContributions } from "@/lib/avatar";
import { listInbox, listPassCandidates } from "@/lib/inbox";
import { listKnowledgeTasks } from "@/lib/knowledge";
import { listRecentReplies } from "@/lib/reply-notices";
import { KnowledgeTasks } from "../chie/KnowledgeTasks";
import { InboxCard } from "./InboxCard";

import { BackLink } from "@/app/BackLink";
export const metadata: Metadata = { title: "受信箱｜こえかた" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { viewer } = await getViewer();
  const db = getDatabase();
  const teams = getDestination(db);
  const items = listInbox(db, viewer.id);
  const replies = listRecentReplies(db, viewer.id);
  const { goals, assists } = countContributions(db, viewer.id);

  return (
    <main className="home">
      <BackLink href="/">話すへもどる</BackLink>
      <header>
        <h1>受信箱</h1>
        <p>話すだけで返せます。詳しくないことは、詳しい人につなげます。</p>
      </header>
      <p className="inbox-counts">
        解決 {goals}・つないだ {assists}
      </p>

      {replies.length > 0 && (
        <section className="card inbox-replies" id="replies" aria-label="届いた返事">
          <h2>届いた返事</h2>
          <ul>
            {replies.map((reply) => (
              <li key={reply.replyId}>
                <Link href={`/teams?channel=${encodeURIComponent(reply.channelId)}#post-${reply.postId}`}>
                  <strong>{reply.authorName}さん</strong>
                  <span>{reply.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <KnowledgeTasks tasks={listKnowledgeTasks(db, viewer.id)} />

      <div className="inbox-list">
        {items.length === 0 ? (
          <p>今届いているお願いはありません。</p>
        ) : (
          items.map((item) => (
            <InboxCard
              key={`${viewer.id}-${item.postId}`}
              item={item}
              candidates={listPassCandidates(db, teams, item.postId, viewer.id)}
            />
          ))
        )}
      </div>
    </main>
  );
}
