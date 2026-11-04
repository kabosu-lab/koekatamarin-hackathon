import { BackLink } from "@/app/BackLink";
import { wornTitles } from "@/lib/titles";
import { PersonTitle } from "../PersonTitle";
import type { Metadata } from "next";
import Link from "next/link";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { MAX_BODY_LENGTH, type PostView } from "@/lib/destination/types";
import { getAvatar } from "@/lib/avatar";
import { getViewer } from "@/lib/current-person";
import { canSaveKnowledge } from "@/lib/knowledge";
import { forgottenSources } from "@/lib/memory";
import { schoolName } from "@/lib/seed-data";
import { AttachmentPreview } from "../AttachmentPreview";
import { Avatar } from "../Avatar";
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

function Author({ name, label, time, image, title }: { name: string; label: string; time: string; image: string; title?: string }) {
  return (
    <p className="author">
      <Avatar image={image} alt={`${name}さんの相棒`} size={28} />
      <strong>{name}</strong> <PersonTitle title={title} /> <span>{label}</span> <time dateTime={time}>{timeFormat.format(new Date(time))}</time>
    </p>
  );
}

function Post({
  post,
  viewerId,
  images,
  titles,
  canShare,
  canSave,
}: {
  post: PostView;
  viewerId: string;
  images: Record<string, string>;
  titles: Record<string, string>;
  canShare: boolean;
  canSave: boolean;
}) {
  return (
    <article className="post" id={`post-${post.id}`} aria-label={`${post.authorName}さんの投稿`}>
      <Author name={post.authorName} label={post.authorLabel} time={post.createdAt} image={images[post.authorId]} title={titles[post.authorId]} />
      {post.askedPersonName && (
        <p className="asked">
          {post.passedThrough.map((name) => `${name}さんがつないで → `).join("")}
          {post.askedPersonName}さんへ
          {post.answered && "（解決！）"}
        </p>
      )}
      <p className="body">{post.body}</p>
      {post.attachment && <AttachmentPreview attachment={post.attachment} />}
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
          <Author name={reply.authorName} label={reply.authorLabel} time={reply.createdAt} image={images[reply.authorId]} title={titles[reply.authorId]} />
          <p className="body">{reply.body}</p>
        </div>
      ))}

      {canSave && (
        <p className="save-knowledge">
          <Link href={`/chie/new?post=${post.id}`}>知恵に残す</Link>
        </p>
      )}

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
  const titles = wornTitles(db);
  const teams = getDestination(db);
  const channels = teams.listChannels(viewer.id);
  const { channel: requested } = await searchParams;
  // 人物を切り替えて見られなくなったチャネルは、最初のチャネルへ戻す
  const channel = channels.find((c) => c.id === requested) ?? channels[0];
  const posts = teams.listPosts(viewer.id, channel.id);
  const forgotten = forgottenSources(db);

  return (
    <div className="teams">
      <BackLink href="/minna">みんなへもどる</BackLink>
      <header className="bar">
        <div>
          <h1>校内チャネル</h1>
          <p>{schoolName}・Teams 風のダミー画面</p>
        </div>
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
                titles={titles}
                canShare={viewer.role !== "student" && channel.audience === "everyone" && post.authorId !== viewer.id}
                canSave={channel.audience === "everyone" && canSaveKnowledge(post, viewer.id, forgotten)}
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
