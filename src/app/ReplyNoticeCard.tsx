import type { ReplyNotice } from "@/lib/reply-notices";
import { closeReplyNotice, openReplyNotice } from "./reply-notice-actions";

/** 届いた返事を最初の画面で知らせる。返事の文章は書かれたまま出す。 */
export function ReplyNoticeCard({ notices }: { notices: ReplyNotice[] }) {
  const [latest, ...others] = notices;
  if (!latest) return null;
  return (
    <section className="reply-notice" aria-label="届いた返事">
      <h2>{latest.authorName}さんから返事が届きました</h2>
      <p className="reply-notice-body">「{latest.body}」</p>
      {others.length > 0 && <p className="reply-notice-more">ほかに {others.length} 件</p>}
      <form className="reply-notice-actions">
        {notices.map((notice) => (
          <input key={notice.replyId} type="hidden" name="replyId" value={notice.replyId} />
        ))}
        <button type="submit" formAction={closeReplyNotice}>
          閉じる
        </button>
        <button type="submit" formAction={openReplyNotice} className="primary">
          投稿を見る
        </button>
      </form>
    </section>
  );
}
