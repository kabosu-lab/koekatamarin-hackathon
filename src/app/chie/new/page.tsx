import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { createDummyTeams } from "@/lib/destination/dummy-teams";
import { loadMaterial } from "@/lib/knowledge";
import { KnowledgeNew } from "./KnowledgeNew";

export const metadata: Metadata = { title: "知恵に残す｜こえかた" };
export const dynamic = "force-dynamic";

export default async function NewKnowledgePage({ searchParams }: { searchParams: Promise<{ post?: string | string[] }> }) {
  const { post } = await searchParams;
  const { viewer } = await getViewer();
  const db = getDatabase();
  const material = typeof post === "string" ? loadMaterial(db, createDummyTeams(db), viewer.id, post) : null;

  return (
    <main className="home chie">
      <h1>知恵に残す</h1>
      {material ? (
        <>
          <section className="card" aria-label="もとのやり取り">
            <p className="chie-body">
              {material.post.authorName}：{material.post.body}
            </p>
            {material.replies.map((reply) => (
              <p className="chie-body" key={reply.id}>
                {reply.authorName}：{reply.body}
              </p>
            ))}
          </section>
          <KnowledgeNew postId={material.post.id} />
        </>
      ) : (
        <p>このやり取りは知恵に残せません。校内に公開され、ほかの人の返事があるやり取りに関わった人が残せます。</p>
      )}
      <p className="staff-link">
        <Link href="/chie">校内の知恵へもどる</Link>
      </p>
    </main>
  );
}
