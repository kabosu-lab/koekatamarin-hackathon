import { Icon } from "@/app/Icon";
import type { Metadata } from "next";
import Link from "next/link";
import { getAvatar } from "@/lib/avatar";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getSakura, isBloomingSeason, parseSeason, type Season, timeOfDay } from "@/lib/sakura";
import { schoolName } from "@/lib/seed-data";
import { cookies } from "next/headers";
import { readAppearance } from "@/lib/appearance";
import { activeEvents } from "@/lib/events";
import { showsRewards } from "@/lib/rewards-view";
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
  const store = await cookies();
  const rewards = showsRewards(readAppearance((name) => store.get(name)?.value));
  const events = rewards ? activeEvents(now) : [];
  const inEvent = events.length > 0;

  return (
    <main className="home">
      <header>
        <h1>みんな</h1>
        <p>{schoolName}</p>
      </header>

      <div className="hub-links">
        <Link href="/today">
          <Icon name="heart" />
          今日の3人
        </Link>
        <Link href="/study">
          <Icon name="book" />
          一緒に勉強する
        </Link>
        <Link href="/chie">
          <Icon name="idea" />
          校内の知恵
        </Link>
        <Link href="/teams">
          <Icon name="chat" />
          校内チャネル（Teams）
        </Link>
      </div>

      {rewards ? (
      <section
        className="sakura-scene"
        data-time={timeOfDay(now)}
        aria-label="校内の桜"
        style={{ backgroundImage: `url(/api/art/school-${sakura.season}.jpg)` }}
      >
        {(isBloomingSeason(sakura.season) || inEvent) &&
          Array.from({ length: inEvent ? 18 : 10 }, (_, i) => (
            <span
              key={i}
              className="petal"
              aria-hidden="true"
              style={{ left: `${inEvent ? (i * 37) % 95 : 5 + i * 9}%`, animationDelay: `${i * (inEvent ? 0.4 : 0.7)}s` }}
            />
          ))}
        <p className="caption">
          {sakura.message}（今年の葉 {sakura.leaves} 枚）
        </p>
      </section>
      ) : (
        <section className="modern-figure" aria-label="今年のやり取り">
          <strong>{sakura.leaves}</strong>
          <span>今年、校内で人に届いたやり取り</span>
        </section>
      )}
      {events.map((event) => (
        <section className="event-banner" key={event.id} aria-label="期間限定のイベント">
          <strong>{event.name}</strong>
          <span>{event.message}</span>
          <small>期間限定のリボン「{event.ribbon.name}」：{event.ribbon.description}と届きます</small>
        </section>
      ))}


      {rewards && (
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
      )}
      {rewards && (
      <p className="season-links" aria-label="季節を見る">
        {SEASON_LABEL.map(([value, label]) => (
          <Link key={value} href={`/minna?season=${value}`}>
            {label}を見る
          </Link>
        ))}
      </p>
      )}
    </main>
  );
}
