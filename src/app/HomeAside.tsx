import Link from "next/link";
import type { DatabaseSync } from "node:sqlite";
import { getAvatar } from "@/lib/avatar";
import { getDestination } from "@/lib/destination/current";
import { listSharedKnowledge } from "@/lib/knowledge";
import { getSakura, isBloomingSeason, timeOfDay } from "@/lib/sakura";
import { listPopularCards } from "@/lib/today";
import { Avatar } from "./Avatar";

const POSTS = 3;
const KNOWLEDGE = 3;
const GATHERING = 8;

/**
 * 0-1q の棚卸し：今はどの画面からも使っていない（広い画面は WidePanels が「みんな」「履歴と設定」を並べる）。
 * コードは消さずに残す。docs/screens.md の「使われていない」を見る。
 */
/** 広い画面だけに出す（CSS）。校内のチャネルと知恵、パートナーと桜。どれも校内に公開されたものだけ。 */
export function HomeAside({ db, viewerId, rewards }: { db: DatabaseSync; viewerId: string; rewards: boolean }) {
  const now = new Date();
  const posts = listPopularCards(getDestination(db), viewerId).slice(0, POSTS);
  const knowledge = listSharedKnowledge(db, viewerId).slice(0, KNOWLEDGE);
  const sakura = getSakura(db, now);
  const people = db.prepare("SELECT id, name FROM people ORDER BY rowid LIMIT ?").all(GATHERING) as { id: string; name: string }[];

  return (
    <aside className="home-aside" aria-label="校内のようす">
      <div className="aside-column">
        <section aria-label="校内チャネルのようす">
          <h2>校内チャネル</h2>
          <ul className="aside-list">
            {posts.map((post) => (
              <li key={post.postId}>
                <p className="who">
                  {post.authorName}・{post.channelName}
                </p>
                <p>{post.body}</p>
              </li>
            ))}
          </ul>
          <p>
            <Link href="/teams">校内チャネルを開く</Link>
          </p>
        </section>
        <section aria-label="校内の知恵のようす">
          <h2>校内の知恵</h2>
          <ul className="aside-list">
            {knowledge.map((item) => (
              <li key={item.id}>
                <Link href={`/chie/${item.id}`}>{item.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {rewards ? (
      <div className="aside-column">
        <section aria-label="パートナーと桜">
          <h2>桜のまわり</h2>
          <div
            className="sakura-scene"
            data-time={timeOfDay(now)}
            style={{ backgroundImage: `url(/api/art/school-${sakura.season}.jpg)` }}
          >
            {isBloomingSeason(sakura.season) && <span className="petal" aria-hidden="true" style={{ left: "40%" }} />}
            <p className="caption">{sakura.message}</p>
          </div>
          <div className="gathering">
            {people.map((person) => (
              <Link key={person.id} href={`/people/${person.id}`}>
                <Avatar image={getAvatar(db, person.id).image} alt={`${person.name}さんのパートナー`} size={56} lazy />
                {person.name}
              </Link>
            ))}
          </div>
        </section>
      </div>
      ) : (
        <div className="aside-column">
          <section aria-label="今年のやり取り" className="modern-figure">
            <strong>{sakura.leaves}</strong>
            <span>今年、校内で人に届いたやり取り</span>
          </section>
        </div>
      )}
    </aside>
  );
}
