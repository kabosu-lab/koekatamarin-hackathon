import type { Metadata } from "next";
import { getViewer } from "@/lib/current-person";
import { LOOKBACK_PERIODS } from "@/lib/lookback";
import { LookbackPanel } from "./LookbackPanel";

import { PageShell } from "@/app/ui/PageShell";
export const metadata: Metadata = { title: "ふりかえり｜こえかた" };
export const dynamic = "force-dynamic";

export default async function LookbackPage() {
  const { viewer } = await getViewer();
  const periods = LOOKBACK_PERIODS.filter((p) => !p.studentOnly || viewer.role === "student").map(({ value, label }) => ({
    value,
    label,
  }));

  return (
    <PageShell back={{ href: "/me", label: "履歴と設定" }} title="ふりかえり">
      <LookbackPanel key={viewer.id} periods={periods} />
    </PageShell>
  );
}
