import type { DatabaseSync } from "node:sqlite";
import Link from "next/link";
import { getDestination } from "@/lib/destination/current";
import { LOOKBACK_PERIODS } from "@/lib/lookback";
import { getPortfolio, listTerms } from "@/lib/portfolio";
import { recipientsOf } from "@/lib/recipients";
import { LookbackPanel } from "../lookback/LookbackPanel";
import { PortfolioPanel } from "../portfolio/PortfolioPanel";
import "../portfolio/portfolio.css";

type Viewer = { id: string; name: string; role: string };

/**
 * 0-2b 第4段：ふりかえり（前のふりかえりとポートフォリオを1つに）。
 * 期間の札は、学期（残す・足す・届けるができる）と、この一年・卒業まで（読むだけ）。
 */
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
  /** 学期の id か、year・all */
  requested?: string;
}) {
  const terms = listTerms(db, viewer.id, now);
  // 学期は lookback の「この学期」と重なるので、長い期間だけを足す
  const longPeriods = LOOKBACK_PERIODS.filter((p) => p.value !== "term" && (!p.studentOnly || viewer.role === "student"));
  const longPeriod = longPeriods.find((p) => p.value === requested);
  const term = longPeriod ? undefined : (terms.find((candidate) => candidate.id === requested) ?? terms[0]);

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
            aria-current={candidate.id === term?.id ? "page" : undefined}
          >
            {candidate.label}
          </Link>
        ))}
        {longPeriods.map((period) => (
          <Link
            key={period.value}
            href={`/me?open=lookback&term=${period.value}`}
            aria-current={period.value === longPeriod?.value ? "page" : undefined}
          >
            {period.label}
          </Link>
        ))}
      </nav>
      {longPeriod ? (
        <LookbackPanel key={`${viewer.id}-${longPeriod.value}`} period={{ value: longPeriod.value, label: longPeriod.label }} />
      ) : (
        term && (
          <PortfolioPanel
            key={`${viewer.id}-${term.id}`}
            initial={getPortfolio(db, viewer.id, term, { rewards })}
            channels={getDestination(db)
              .listChannels(viewer.id)
              .map(({ id, name }) => ({ id, name }))}
            recipients={recipientsOf(db, viewer.id)}
            viewerName={viewer.name}
            noun={noun}
            rewards={rewards}
          />
        )
      )}
    </>
  );
}
