import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { BackLink } from "@/app/BackLink";
import { readAppearance } from "@/lib/appearance";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { getPortfolio, listTerms } from "@/lib/portfolio";
import { recipientsOf } from "@/lib/recipients";
import { showsRewards } from "@/lib/rewards-view";
import { syncRibbons } from "@/lib/ribbons";
import { isTrialMode } from "@/lib/trial";
import { PortfolioPanel } from "./PortfolioPanel";
import "./portfolio.css";

export const metadata: Metadata = { title: "ポートフォリオ｜こえかた" };
export const dynamic = "force-dynamic";

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ term?: string | string[] }> }) {
  const { viewer } = await getViewer();
  const store = await cookies();
  const rewards = showsRewards(readAppearance((name) => store.get(name)?.value));
  const db = getDatabase();
  const now = new Date();
  syncRibbons(db, viewer.id, now);

  const terms = listTerms(db, viewer.id, now);
  const { term: requested } = await searchParams;
  const term = terms.find((candidate) => candidate.id === requested) ?? terms[0];
  const channels = getDestination(db)
    .listChannels(viewer.id)
    .map(({ id, name }) => ({ id, name }));

  return (
    <main className="home">
      <BackLink href="/me">履歴と設定へもどる</BackLink>
      <header>
        <h1>ポートフォリオ</h1>
      </header>
      <p className="portfolio-note">
        {isTrialMode()
          ? "試用中なので、同じ人物を選んだ人にも見えます。実名や個人情報は入れないでください。"
          : "あなただけに見えます。Teams へは、あなたが選んで確かめたときだけ届きます。"}
      </p>
      <nav className="portfolio-terms" aria-label="学期を選ぶ">
        {terms.map((candidate) => (
          <Link key={candidate.id} href={`/portfolio?term=${candidate.id}`} aria-current={candidate.id === term.id ? "page" : undefined}>
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
        noun={viewer.role === "student" ? "日記" : "日報"}
        rewards={rewards}
      />
    </main>
  );
}
