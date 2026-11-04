import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { WalkMode } from "./WalkMode";

export const metadata: Metadata = { title: "歩きながら話す｜こえかた" };
export const dynamic = "force-dynamic";

export default async function WalkPage() {
  const { viewer } = await getViewer();
  return (
    <main className="home walk-page">
      <h1>歩きながら話す</h1>
      <p>手を使わず、話しっぱなしで大丈夫です。話し終わったら、整理して、投稿の下書きを作ります。</p>
      <WalkMode key={viewer.id} viewer={{ name: viewer.name, label: viewer.label }} viewerId={viewer.id} />
      <p className="staff-link">
        <Link href="/">もどる</Link>
      </p>
    </main>
  );
}
