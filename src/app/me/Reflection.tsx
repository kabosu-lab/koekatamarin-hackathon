import type { DatabaseSync } from "node:sqlite";
import Link from "next/link";
import { getDestination } from "@/lib/destination/current";
import { getPortfolio, listTerms } from "@/lib/portfolio";
import { recipientsOf } from "@/lib/recipients";
import { PortfolioPanel } from "../portfolio/PortfolioPanel";
import "../portfolio/portfolio.css";

type Viewer = { id: string; name: string; role: string };

/** 0-2b：ふりかえり（前のポートフォリオ）。学期を札で選び、残す・足す・届けるはここだけ */
export function Reflection({
  db,
  viewer,
  now,
  rewards,
  trial,
  noun,
  requested,
}: {
  db: DatabaseSync;
  viewer: Viewer;
  now: Date;
  rewards: boolean;
  trial: boolean;
  noun: string;
  requested?: string;
}) {
  const terms = listTerms(db, viewer.id, now);
  const term = terms.find((candidate) => candidate.id === requested) ?? terms[0];
  const channels = getDestination(db)
    .listChannels(viewer.id)
    .map(({ id, name }) => ({ id, name }));

  return (
    <>
      <p className="portfolio-note">
        {trial
          ? "試用中なので、同じ人物を選んだ人にも見えます。実名や個人情報は入れないでください。"
          : "あなただけに見えます。Teams へは、あなたが選んで確かめたときだけ届きます。"}
      </p>
      <nav className="portfolio-terms" aria-label="期間を選ぶ">
        {terms.map((candidate) => (
          <Link
            key={candidate.id}
            href={`/me?open=lookback&term=${candidate.id}`}
            aria-current={candidate.id === term.id ? "page" : undefined}
          >
            {candidate.label}
          </Link>
        ))}
      </nav>
      <PortfolioPanel
        key={`${viewer.id}-${term.id}`}
        initial={getPortfolio(db, viewer.id, term, { rewards })}
        channels={channels}
        recipients={recipientsOf(db, viewer.id)}
        viewerName={viewer.name}
        noun={noun}
        rewards={rewards}
      />
    </>
  );
}
