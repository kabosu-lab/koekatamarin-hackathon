import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** 0-2b：ポートフォリオは「ふりかえり」のタイルの中へ1つにした。前のリンクで来ても迷わないよう送る */
export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ term?: string | string[] }> }) {
  const { term } = await searchParams;
  redirect(typeof term === "string" ? `/me?open=lookback&term=${encodeURIComponent(term)}` : "/me?open=lookback");
}
