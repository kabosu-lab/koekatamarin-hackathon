import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { dailyQuestion } from "@/lib/daily-question";
import { countForNotice } from "@/lib/inbox";
import { PersonSwitcher } from "./PersonSwitcher";
import { Talk } from "./Talk";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { viewer, people } = await getViewer();
  const waiting = countForNotice(getDatabase(), viewer.id, new Date());
  return (
    <main className="home">
      <header>
        <h1>こえかた</h1>
        <p>一人で抱えない。</p>
        <PersonSwitcher viewerId={viewer.id} people={people} />
      </header>
      {/* Claude との話は本人だけのもの。人物を切り替えたら会話を持ち越さない */}
      <p className="staff-link">
        <Link href="/inbox">受信箱{waiting > 0 && `（お願いが ${waiting} 件）`}</Link>
      </p>
      {viewer.role !== "student" && (
        <p className="staff-link">
          <Link href="/soudan">相談室への知らせを見る</Link>
        </p>
      )}
      <Talk key={viewer.id} viewer={{ name: viewer.name, label: viewer.label }} question={dailyQuestion(new Date())} />
    </main>
  );
}
