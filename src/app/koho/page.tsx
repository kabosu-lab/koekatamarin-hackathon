import type { Metadata } from "next";
import { BackLink } from "@/app/BackLink";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { isKohoOfficer, listKohoAsked, listKohoCandidates } from "@/lib/koho";
import { askAuthor } from "./actions";

export const metadata: Metadata = { title: "広報の候補｜こえかた" };
export const dynamic = "force-dynamic";

/** 広報の担当だけの画面。ダミーで、校外へは何も出さない。 */
export default async function KohoPage() {
  const { viewer } = await getViewer();
  const db = getDatabase();
  if (!isKohoOfficer(viewer.id)) {
    return (
      <main className="home">
        <BackLink href="/minna">みんなへもどる</BackLink>
        <h1>広報の候補</h1>
        <p>この画面は広報の担当の先生のものです。</p>
      </main>
    );
  }
  const candidates = listKohoCandidates(db, viewer.id);
  const asked = listKohoAsked(db, viewer.id);
  return (
    <main className="home">
      <BackLink href="/minna">みんなへもどる</BackLink>
      <header>
        <h1>広報の候補</h1>
        <p>校内で反応があった投稿です。外へ出すには、本人の確認が要ります。校外へ出すのは、学校が確かめたあと、学校の広報用アカウントからだけです。</p>
      </header>
      <section className="card" aria-label="本人に確認したもの">
        <h2>本人に確認したもの</h2>
        {asked.length === 0 && <p className="muted">まだありません。</p>}
        {asked.map((item) => (
          <p key={item.postId}>
            {item.authorName}：{item.body}（{item.agreed ? "本人が同意しました。学校の確認へ進めます" : "進んでいません"}）
          </p>
        ))}
      </section>
      <section className="card" aria-label="候補">
        <h2>候補</h2>
        {candidates.length === 0 && <p className="muted">今は候補がありません。</p>}
        {candidates.map((candidate) => (
          <article key={candidate.postId} aria-label={`${candidate.authorName}さんの投稿`}>
            <p>
              <strong>{candidate.authorName}</strong>：{candidate.body}
            </p>
            <form action={askAuthor}>
              <input type="hidden" name="postId" value={candidate.postId} />
              <button type="submit">本人に確認する</button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
