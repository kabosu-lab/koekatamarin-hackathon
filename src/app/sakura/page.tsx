import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { BackLink } from "@/app/BackLink";
import { readAppearance } from "@/lib/appearance";
import { getAvatar } from "@/lib/avatar";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { activeEvents } from "@/lib/events";
import { showsRewards } from "@/lib/rewards-view";
import { getSakura, isBloomingSeason, parseSeason, type Season, timeOfDay } from "@/lib/sakura";
import { Avatar } from "../Avatar";
import { RoomBackdrop } from "../study/room/RoomBackdrop";
import "../study/room/room.css";

export const metadata: Metadata = { title: "校内の桜｜こえかた" };
export const dynamic = "force-dynamic";

const SEASON_LABEL: [Season, string][] = [
  ["haru", "春"],
  ["natsu", "夏"],
  ["aki", "秋"],
  ["fuyu", "冬"],
];

/** 校内の桜の詳しい画面。季節と、まわりのパートナーを見る。 */
export default async function SakuraPage({ searchParams }: { searchParams: Promise<{ season?: string | string[] }> }) {
  const { people } = await getViewer();
  const { season: requested } = await searchParams;
  const db = getDatabase();
  const now = new Date();
  const sakura = getSakura(db, now, parseSeason(requested) ?? undefined);
  const store = await cookies();
  const rewards = showsRewards(readAppearance((name) => store.get(name)?.value));
  const inEvent = rewards && activeEvents(now).length > 0;

  return (
    <main className="home">
      <BackLink href="/minna">みんなへもどる</BackLink>
      <header>
        <h1>校内の桜</h1>
      </header>
      <section
        className="sakura-scene"
        data-time={timeOfDay(now)}
        aria-label="校内の桜"
      >
        <RoomBackdrop place="garden" label="校庭の桜の木" season={sakura.season} />
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
      <p className="muted">投稿、返信、ありがとう、いいね、一緒の勉強で葉が増えます。パートナーと話すだけでは増えません。</p>
      {rewards && (
        <section className="card" aria-label="桜のまわりのパートナーたち">
          <h2>桜のまわりのパートナーたち</h2>
          <div className="gathering">
            {people.map((person) => (
              <Link key={person.id} href={`/people/${person.id}`}>
                <Avatar image={getAvatar(db, person.id).image} alt={`${person.name}さんのパートナー`} size={56} />
                {person.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      <p className="season-links" aria-label="季節を見る">
        {SEASON_LABEL.map(([value, label]) => (
          <Link key={value} href={`/sakura?season=${value}`}>
            {label}を見る
          </Link>
        ))}
      </p>
    </main>
  );
}
