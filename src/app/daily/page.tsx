import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getReport, japanDate, recipientsOf } from "@/lib/daily";
import { getDatabase } from "@/lib/db";
import { PersonSwitcher } from "../PersonSwitcher";
import { DailyPanel } from "./DailyPanel";

export const metadata: Metadata = { title: "今日のまとめ｜コエカタ" };
export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const { viewer, people } = await getViewer();
  const db = getDatabase();
  const noun = viewer.role === "student" ? "日記" : "日報";

  return (
    <main className="home">
      <header>
        <h1>今日の{noun}</h1>
        <PersonSwitcher viewerId={viewer.id} people={people} />
      </header>
      <DailyPanel
        key={viewer.id}
        initialReport={getReport(db, viewer.id, japanDate(new Date()))}
        recipients={recipientsOf(db, viewer.id)}
        viewerName={viewer.name}
        noun={noun}
      />
      <p className="staff-link">
        <Link href="/me">じぶんへもどる</Link>
      </p>
    </main>
  );
}
