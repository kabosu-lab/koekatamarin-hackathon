import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { createDummyTeams } from "@/lib/destination/dummy-teams";
import { LOOKBACK_PERIODS } from "@/lib/lookback";
import { PersonSwitcher } from "../PersonSwitcher";
import { LookbackPanel } from "./LookbackPanel";

export const metadata: Metadata = { title: "ふりかえり｜コエカタ" };
export const dynamic = "force-dynamic";

export default async function LookbackPage() {
  const { viewer, people } = await getViewer();
  const channels = createDummyTeams(getDatabase())
    .listChannels(viewer.id)
    .map(({ id, name }) => ({ id, name }));
  const periods = LOOKBACK_PERIODS.filter((p) => !p.studentOnly || viewer.role === "student").map(({ value, label }) => ({
    value,
    label,
  }));

  return (
    <main className="home">
      <header>
        <h1>ふりかえり</h1>
        <PersonSwitcher viewerId={viewer.id} people={people} />
      </header>
      <LookbackPanel key={viewer.id} periods={periods} channels={channels} />
      <p className="staff-link">
        <Link href="/me">じぶんへもどる</Link>
      </p>
    </main>
  );
}
