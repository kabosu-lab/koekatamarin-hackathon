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
import {
  bloomExplanation,
  bloomLine,
  bloomProgress,
  getSakura,
  isBloomingSeason,
  parseSeason,
  SAKURA_STORY,
  type Season,
  timeOfDay,
} from "@/lib/sakura";
import { Avatar } from "../Avatar";
import { SakuraScene } from "../minna/SakuraScene";
import "../minna/minna.css";

export const metadata: Metadata = { title: "校内の桜｜こえかた" };
export const dynamic = "force-dynamic";

const SEASON_LABEL: [Season, string][] = [
  ["haru", "春"],
  ["natsu", "夏"],
  ["aki", "秋"],
  ["fuyu", "冬"],
];

/**
 * 校内の桜の詳しい画面。季節と、まわりのパートナーを見る。
 * 動画用：`/sakura?hayaokuri=1` で、葉が 0 から満開まで集まり春に咲く早回しを流す（データは変えない）。
 */
export default async function SakuraPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string | string[]; hayaokuri?: string | string[] }>;
}) {
  const { people } = await getViewer();
  const { season: requested, hayaokuri } = await searchParams;
  const db = getDatabase();
  const now = new Date();
  const sakura = getSakura(db, now, parseSeason(requested) ?? undefined);
  const store = await cookies();
  const rewards = showsRewards(readAppearance((name) => store.get(name)?.value));
  const inEvent = rewards && activeEvents(now).length > 0;
  const petals = isBloomingSeason(sakura.season) || inEvent ? (inEvent ? 18 : 10) : 0;

  return (
    <main className="home sakura-page">
      <BackLink href="/minna">みんなへもどる</BackLink>
      <header>
        <h1>校内の桜</h1>
      </header>
      <SakuraScene
        as="section"
        ariaLabel="校内の桜"
        season={sakura.season}
        time={timeOfDay(now)}
        leaves={sakura.leaves}
        petals={petals}
        fastForward={hayaokuri === "1"}
      >
        <p className="caption">
          {sakura.message}（今年の葉 {sakura.leaves} 枚）
        </p>
      </SakuraScene>
      {/* 0-1j(1)：一行の説明と満開までの進み。0-1j(3)：春の見通し */}
      <p className="sakura-story">{SAKURA_STORY}</p>
      <p className="sakura-progress">
        <span className="minna-sakura-meter" aria-hidden="true">
          <span style={{ transform: `scaleX(${bloomProgress(sakura.leaves)})` }} />
        </span>
        <span className="minna-sakura-rest">{bloomLine(sakura.leaves)}</span>
      </p>
      <ul className="muted sakura-forecast" aria-label="春の見通し">
        {bloomExplanation(sakura.leaves).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
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
