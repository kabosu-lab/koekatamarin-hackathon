import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { LOOKBACK_PERIODS } from "@/lib/lookback";
import { LookbackPanel } from "./LookbackPanel";

import { BackLink } from "@/app/BackLink";
export const metadata: Metadata = { title: "ふりかえり｜こえかた" };
export const dynamic = "force-dynamic";

export default async function LookbackPage() {
  const { viewer } = await getViewer();
  const channels = getDestination(getDatabase())
    .listChannels(viewer.id)
    .map(({ id, name }) => ({ id, name }));
  const periods = LOOKBACK_PERIODS.filter((p) => !p.studentOnly || viewer.role === "student").map(({ value, label }) => ({
    value,
    label,
  }));

  return (
    <main className="home">
      <BackLink href="/me">履歴と設定へもどる</BackLink>
      <header>
        <h1>ふりかえり</h1>
      </header>
      <LookbackPanel key={viewer.id} periods={periods} channels={channels} />
    </main>
  );
}
