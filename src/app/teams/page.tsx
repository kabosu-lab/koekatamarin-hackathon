import type { Metadata } from "next";
import Link from "next/link";
import { getDatabase } from "@/lib/db";
import { createDummyTeams } from "@/lib/destination/dummy-teams";
import { MAX_BODY_LENGTH, type PostView } from "@/lib/destination/types";
import { getAvatar } from "@/lib/avatar";
import { getViewer } from "@/lib/current-person";
import { schoolName } from "@/lib/seed-data";
import { Avatar } from "../Avatar";
import { PersonSwitcher } from "../PersonSwitcher";
import { createPost, createReply, shareConcern, toggleLike } from "./actions";
import "./teams.css";

export const metadata: Metadata = { title: "校内チャネル｜こえかた" };
export const dynamic = "force-dynamic";

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const SCOPE_LABEL = {
  person: "特定の人だけ",
  managers: "管理職や担任だけ",
  self: "自分だけ",
};

function Author({ name, label, time, image }: { name: string; label: string; time: string; image: string }) {
  return (
    <p className="author">
      <Avatar image={image} alt={`${name}さんの相棒`} size={28} />
      <strong>{name}</strong> <span>{label}</span> <time dateTime={time}>{timeFormat.format(new Date(time))}</time>
    </p>
  );
}

function Post({
  post,
  viewerId,
  images,
  canShare,
}: {
  post: PostView;
  viewerId: string;
  images: Record<string, string>;
  canShare: boolean;
}) {
  return (
    <article className="post" aria-label={`${post.authorName}さんの投稿`}>
      <Author name={post.authorName} label={post.authorLabel} time={post.createdAt} image={images[post.authorId]} />
      {post.askedPersonName && (
        <p className="asked">
          {post.passedThrough.map((name) => `${name}さんのパス → `).join("")}
          {post.askedPersonName}さんへ
          {post.answered && "（ゴール！）"}
        </p>
      )}
      <p className="body">{post.body}</p>
      {post.researchedWithAi && <p className="ai-mark">AI と調べました</p>}
      {post.scope !== "everyone" && <p className="ai-mark">{SCOPE_LABEL[post.scope]}</p>}

      {post.needsLook && !post.sharedToStaff && (
        <p className="needs-look">相棒より：言い方が少し気になります。人の目で確かめてください（判断するのは先生です）</p>
      )}
      {post.sharedToStaff && <p className="needs-look">教職員のチャネルで共有済みです</p>}
      {canShare && post.scope === "everyone" && !post.sharedToStaff && (
        <form action={shareConcern}>
          <input type="hidden" name="postId" value={post.id} />
          <button type="submit" className="share-concern">
            教職員で共有する
          </button>
        </form>
      )}

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
          <Author name={reply.authorName} label={reply.authorLabel} time={reply.createdAt} image={images[reply.authorId]} />
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
  const { viewer, people } = await getViewer();

  const db = getDatabase();
  const images = Object.fromEntries(people.map((p) => [p.id, getAvatar(db, p.id).image]));
  const teams = createDummyTeams(db);
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
        <PersonSwitcher viewerId={viewer.id} people={people} />
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
            <li>
              <Link href="/study/room">自習室（タブ）</Link>
            </li>
          </ul>
        </nav>

        <main>
          <h2>{channel.name}</h2>
          <p className="description">{channel.description}</p>

          {posts.length === 0 ? (
            <p className="empty">まだ投稿はありません。</p>
          ) : (
            posts.map((post) => <Post
                key={post.id}
                post={post}
                viewerId={viewer.id}
                images={images}
                canShare={viewer.role !== "student" && channel.audience === "everyone" && post.authorId !== viewer.id}
              />)
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
