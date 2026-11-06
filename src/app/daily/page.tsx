import type { Metadata } from "next";
import { getViewer } from "@/lib/current-person";
import { getReport, japanDate, recipientsOf } from "@/lib/daily";
import { getDatabase } from "@/lib/db";
import { DailyPanel } from "./DailyPanel";

import { PageShell } from "@/app/ui/PageShell";
export const metadata: Metadata = { title: "今日のまとめ｜こえかた" };
export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const { viewer } = await getViewer();
  const db = getDatabase();
  const noun = viewer.role === "student" ? "日記" : "日報";

  return (
    <PageShell back={{ href: "/me", label: "履歴と設定" }} title={`今日の${noun}`}>
      <DailyPanel
        key={viewer.id}
        initialReport={getReport(db, viewer.id, japanDate(new Date()))}
        recipients={recipientsOf(db, viewer.id)}
        viewerName={viewer.name}
        noun={noun}
      />
    </PageShell>
  );
}
