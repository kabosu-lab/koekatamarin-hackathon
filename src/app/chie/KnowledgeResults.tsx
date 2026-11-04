import Link from "next/link";
import type { KnowledgeResult } from "@/lib/knowledge";

/** 探した結果。本文は実際の投稿や知恵のもので、誰の言葉かと元の投稿を必ず示す。 */
export function KnowledgeResults({
  results,
  viewerName,
  onAsk,
}: {
  results: KnowledgeResult[];
  viewerName: string;
  onAsk?(person: { id: string; name: string }): void;
}) {
  return (
    <ul className="chie-results">
      {results.map((result) => (
        <li key={result.key}>
          <strong>
            {result.knowledgeId ? <Link href={`/chie/${result.knowledgeId}`}>{result.title}</Link> : result.title}
          </strong>
          <p className="chie-body">{result.body}</p>
          {result.researchedWithAi && <p className="ai-mark">AI と調べました</p>}
          <p className="muted">相棒より：{result.reason}</p>
          <p className="muted">{result.people.map((person) => `${person.name}さん`).join("、")}の言葉</p>
          <p className="chie-links">
            <Link href={`/teams?channel=${result.channelId}#post-${result.postId}`}>元の投稿を見る</Link>
            {result.askable
              .filter((person) => person.name !== viewerName)
              .map((person) =>
                onAsk ? (
                  <button key={person.id} type="button" className="secondary" onClick={() => onAsk(person)}>
                    {person.name}さんに聞いてみる？
                  </button>
                ) : (
                  <Link key={person.id} href={`/?ask=${person.id}`}>
                    {person.name}さんに聞いてみる？
                  </Link>
                ),
              )}
          </p>
        </li>
      ))}
    </ul>
  );
}
