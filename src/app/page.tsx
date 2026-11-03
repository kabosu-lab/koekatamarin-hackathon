import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { dailyQuestion } from "@/lib/daily-question";
import { countForNotice } from "@/lib/inbox";
import { countKnowledgeForNotice } from "@/lib/knowledge";
import { PersonSwitcher } from "./PersonSwitcher";
import { Talk } from "./Talk";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ask?: string | string[] }> }) {
  const { ask } = await searchParams;
  const { viewer, people } = await getViewer();
  const db = getDatabase();
  const waiting = countForNotice(db, viewer.id, new Date());
  const knowledgeTasks = countKnowledgeForNotice(db, viewer.id, new Date());
  // 知恵の画面から「聞いてみる？」で来たときの相手
  const askPerson = typeof ask === "string" && ask !== viewer.id ? people.find((person) => person.id === ask) : undefined;
  return (
    <main className="home">
      <header>
        <h1>こえかた</h1>
        <p>一人で抱えない。</p>
        <PersonSwitcher viewerId={viewer.id} people={people} />
      </header>
      {/* Claude との話は本人だけのもの。人物を切り替えたら会話を持ち越さない */}
      <p className="staff-link">
        <Link href="/inbox">
          受信箱
          {waiting > 0 && `（お願いが ${waiting} 件）`}
          {knowledgeTasks > 0 && `（知恵の確認が ${knowledgeTasks} 件）`}
        </Link>
      </p>
      {viewer.role !== "student" && (
        <p className="staff-link">
          <Link href="/soudan">相談室への知らせを見る</Link>
        </p>
      )}
      <Talk
        key={viewer.id}
        viewer={{ name: viewer.name, label: viewer.label }}
        question={dailyQuestion(new Date())}
        initialAsk={askPerson ? { id: askPerson.id, name: askPerson.name } : null}
      />
    </main>
  );
}
