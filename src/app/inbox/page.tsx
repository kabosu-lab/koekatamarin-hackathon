import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { syncFromTeamsIfStale } from "@/lib/destination/teams-bridge";
import { countContributions } from "@/lib/avatar";
import { listInbox, listPassCandidates } from "@/lib/inbox";
import { listKnowledgeTasks } from "@/lib/knowledge";
import { listKohoRequests } from "@/lib/koho";
import { listRecentReplies } from "@/lib/reply-notices";
import { agreeKoho, declineKoho } from "../koho/actions";
import { KnowledgeTasks } from "../chie/KnowledgeTasks";
import { listReceived } from "@/lib/daily";
import { InboxCard } from "./InboxCard";
import { ReceivedReports } from "./ReceivedReports";

import { PageShell } from "@/app/ui/PageShell";
export const metadata: Metadata = { title: "受信箱｜こえかた" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { viewer } = await getViewer();
  const db = getDatabase();
  // Teams で直接メンションされた投稿や返事も、受信箱に入れる（0-2g）
  await syncFromTeamsIfStale(db);
  const teams = getDestination(db);
  const items = listInbox(db, viewer.id);
  const replies = listRecentReplies(db, viewer.id);
  const { goals, assists } = countContributions(db, viewer.id);

  return (
    <PageShell back={{ href: "/minna", label: "みんな" }} title="受信箱" lead="話すだけで返せます。詳しくないことは、詳しい人につなげます。">
      <p className="inbox-counts">
        解決 {goals}・つないだ {assists}
      </p>

      {listKohoRequests(db, viewer.id).map((request) => (
        <section className="card" aria-label="広報への紹介の確認" key={request.postId}>
          <h2>広報で紹介してもよいですか</h2>
          <p>{request.body}</p>
          <p className="muted">校外へ出すのは、学校が確かめたあと、学校の広報用アカウントからだけです。断っても、誰にも伝わりません。</p>
          <form>
            <input type="hidden" name="postId" value={request.postId} />
            {request.isStudent && (
              <label>
                <input type="checkbox" name="guardian" /> 保護者の同意があります
              </label>
            )}
            <div className="row">
              <button type="submit" formAction={declineKoho} className="secondary">
                紹介しない
              </button>
              <button type="submit" formAction={agreeKoho}>
                紹介してよい
              </button>
            </div>
          </form>
        </section>
      ))}

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

      <ReceivedReports reports={listReceived(db, viewer.id)} />

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
    </PageShell>
  );
}
