import type { Metadata } from "next";
import Link from "next/link";
import { getAvatar } from "@/lib/avatar";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getSakura, isBloomingSeason, parseSeason, type Season, timeOfDay } from "@/lib/sakura";
import { schoolName } from "@/lib/seed-data";
import { Avatar } from "../Avatar";

export const metadata: Metadata = { title: "みんな｜こえかた" };
export const dynamic = "force-dynamic";

const SEASON_LABEL: [Season, string][] = [
  ["haru", "春"],
  ["natsu", "夏"],
  ["aki", "秋"],
  ["fuyu", "冬"],
];

export default async function MinnaPage({ searchParams }: { searchParams: Promise<{ season?: string | string[] }> }) {
  const { people } = await getViewer();
  const { season: requested } = await searchParams;
  const db = getDatabase();
  const now = new Date();
  const sakura = getSakura(db, now, parseSeason(requested) ?? undefined);

  return (
    <main className="home">
      <header>
        <h1>みんな</h1>
        <p>{schoolName}</p>
      </header>

      <section
        className="sakura-scene"
        data-time={timeOfDay(now)}
        aria-label="校内の桜"
        style={{ backgroundImage: `url(/api/art/school-${sakura.season}.jpg)` }}
      >
        {isBloomingSeason(sakura.season) &&
          Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className="petal"
              aria-hidden="true"
              style={{ left: `${5 + i * 9}%`, animationDelay: `${i * 0.7}s` }}
            />
          ))}
        <p className="caption">
          {sakura.message}（今年の葉 {sakura.leaves} 枚）
        </p>
      </section>
      <p className="season-links" aria-label="季節を見る">
        {SEASON_LABEL.map(([value, label]) => (
          <Link key={value} href={`/minna?season=${value}`}>
            {label}を見る
          </Link>
        ))}
      </p>

      <div className="hub-links">
        <Link href="/today">今日の3人</Link>
        <Link href="/study">一緒に勉強する</Link>
        <Link href="/nakama">仲間を探す</Link>
        <Link href="/teams">校内チャネル（Teams）</Link>
      </div>

      <section className="card" aria-label="桜のまわりの相棒たち">
        <h2>桜のまわりの相棒たち</h2>
        <div className="gathering">
          {people.map((person) => (
            <Link key={person.id} href={`/people/${person.id}`}>
              <Avatar image={getAvatar(db, person.id).image} alt={`${person.name}さんの相棒`} size={56} />
              {person.name}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
