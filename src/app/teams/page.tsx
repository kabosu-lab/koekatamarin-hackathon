import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { getDatabase } from "@/lib/db";
import { createDummyTeams } from "@/lib/destination/dummy-teams";
import { MAX_BODY_LENGTH, type PostView } from "@/lib/destination/types";
import { listPeople } from "@/lib/people";
import { schoolName } from "@/lib/seed-data";
import { createPost, createReply, switchPerson, toggleLike } from "./actions";
import { DEFAULT_PERSON_ID, PERSON_COOKIE } from "./person";
import "./teams.css";

export const metadata: Metadata = { title: "校内チャネル｜コエカタ" };
export const dynamic = "force-dynamic";

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Author({ name, label, time }: { name: string; label: string; time: string }) {
  return (
    <p className="author">
      <strong>{name}</strong> <span>{label}</span> <time dateTime={time}>{timeFormat.format(new Date(time))}</time>
    </p>
  );
}

function Post({ post, viewerId }: { post: PostView; viewerId: string }) {
  return (
    <article className="post" aria-label={`${post.authorName}さんの投稿`}>
      <Author name={post.authorName} label={post.authorLabel} time={post.createdAt} />
      <p className="body">{post.body}</p>

      {post.authorId === viewerId ? (
        <p className="likes">いいね {post.likeCount}</p>
      ) : (
        <form action={toggleLike}>
          <input type="hidden" name="postId" value={post.id} />
          <button type="submit" className="like" aria-pressed={post.likedByViewer}>
            いいね {post.likeCount}
          </button>
        </form>
      )}

      {post.replies.map((reply) => (
        <div className="reply" key={reply.id}>
          <Author name={reply.authorName} label={reply.authorLabel} time={reply.createdAt} />
          <p className="body">{reply.body}</p>
        </div>
      ))}

      <form action={createReply} className="compose">
        <input type="hidden" name="postId" value={post.id} />
        <input name="body" aria-label="返信" placeholder="返信する" required maxLength={MAX_BODY_LENGTH} />
        <button type="submit">返信</button>
      </form>
    </article>
  );
}

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string | string[] }>;
}) {
  const people = listPeople();
  const cookieValue = (await cookies()).get(PERSON_COOKIE)?.value;
  const viewer = people.find((p) => p.id === cookieValue) ?? people.find((p) => p.id === DEFAULT_PERSON_ID) ?? people[0];

  const teams = createDummyTeams(getDatabase());
  const channels = teams.listChannels(viewer.id);
  const { channel: requested } = await searchParams;
  // 人物を切り替えて見られなくなったチャネルは、最初のチャネルへ戻す
  const channel = channels.find((c) => c.id === requested) ?? channels[0];
  const posts = teams.listPosts(viewer.id, channel.id);

  return (
    <div className="teams">
      <header className="bar">
        <div>
          <h1>校内チャネル</h1>
          <p>{schoolName}・Teams 風のダミー画面</p>
        </div>
        <form action={switchPerson} className="switcher">
          <label>
            使う人
            <select name="personId" defaultValue={viewer.id} key={viewer.id}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{p.label}）
                </option>
              ))}
            </select>
          </label>
          <button type="submit">切り替え</button>
        </form>
      </header>

      <div className="columns">
        <nav aria-label="チャネル">
          <ul>
            {channels.map((c) => (
              <li key={c.id}>
                <Link href={`/teams?channel=${c.id}`} aria-current={c.id === channel.id ? "page" : undefined}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main>
          <h2>{channel.name}</h2>
          <p className="description">{channel.description}</p>

          {posts.length === 0 ? (
            <p className="empty">まだ投稿はありません。</p>
          ) : (
            posts.map((post) => <Post key={post.id} post={post} viewerId={viewer.id} />)
          )}

          <form action={createPost} className="compose new-post">
            <input type="hidden" name="channelId" value={channel.id} />
            <textarea
              name="body"
              aria-label="新しい投稿"
              placeholder={`${channel.name}に投稿する`}
              rows={2}
              required
              maxLength={MAX_BODY_LENGTH}
            />
            <button type="submit">投稿</button>
          </form>
        </main>
      </div>
    </div>
  );
}
