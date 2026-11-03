import type { Metadata } from "next";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { listHiddenPeople } from "@/lib/nakama";
import { PersonSwitcher } from "../PersonSwitcher";
import { NakamaFinder } from "./NakamaFinder";

export const metadata: Metadata = { title: "仲間を探す｜こえかた" };
export const dynamic = "force-dynamic";

export default async function NakamaPage() {
  const { viewer, people } = await getViewer();
  const hidden = listHiddenPeople(getDatabase(), viewer.id);

  return (
    <main className="home">
      <header>
        <h1>仲間を探す</h1>
        <p>校内に公開した言葉とプロフィールから、同じことに取り組んでいそうな人を探します。相棒との話は使いません。</p>
        <PersonSwitcher viewerId={viewer.id} people={people} />
      </header>
      <NakamaFinder key={viewer.id} hidden={hidden} />
    </main>
  );
}
