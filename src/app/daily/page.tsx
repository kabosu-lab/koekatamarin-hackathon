import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getReport, japanDate, recipientsOf } from "@/lib/daily";
import { getDatabase } from "@/lib/db";
import { DailyPanel } from "./DailyPanel";

import { BackLink } from "@/app/BackLink";
export const metadata: Metadata = { title: "今日のまとめ｜こえかた" };
export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const { viewer } = await getViewer();
  const db = getDatabase();
  const noun = viewer.role === "student" ? "日記" : "日報";

  return (
    <main className="home">
      <BackLink href="/me">じぶんへもどる</BackLink>
      <header>
        <h1>今日の{noun}</h1>
      </header>
      <DailyPanel
        key={viewer.id}
        initialReport={getReport(db, viewer.id, japanDate(new Date()))}
        recipients={recipientsOf(db, viewer.id)}
        viewerName={viewer.name}
        noun={noun}
      />
    </main>
  );
}
