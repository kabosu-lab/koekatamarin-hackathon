import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { LOOKBACK_PERIODS } from "@/lib/lookback";
import { LookbackPanel } from "./LookbackPanel";

import { PageShell } from "@/app/ui/PageShell";
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
    <PageShell back={{ href: "/me", label: "履歴と設定" }} title="ふりかえり">
      <LookbackPanel key={viewer.id} periods={periods} channels={channels} />
    </PageShell>
  );
}
