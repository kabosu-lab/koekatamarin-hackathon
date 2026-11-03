import Link from "next/link";
import type { KnowledgeTask } from "@/lib/knowledge";

const REASON = { confirm: "確認をお願いします", fix: "直しのお願いがあります" };

/** 本人の確認や直しが要る知恵。 */
export function KnowledgeTasks({ tasks }: { tasks: KnowledgeTask[] }) {
  if (tasks.length === 0) return null;
  return (
    <section className="card" aria-label="知恵の確認">
      <h2>知恵の確認</h2>
      <ul className="chie-list">
        {tasks.map((task) => (
          <li key={`${task.id}-${task.reason}`}>
            <Link href={`/chie/${task.id}`}>{task.title}</Link>
            <p className="muted">{REASON[task.reason]}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
