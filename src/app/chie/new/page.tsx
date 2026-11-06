import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { loadMaterial } from "@/lib/knowledge";
import { KnowledgeNew } from "./KnowledgeNew";

import { PageShell } from "@/app/ui/PageShell";
export const metadata: Metadata = { title: "知恵に残す｜こえかた" };
export const dynamic = "force-dynamic";

export default async function NewKnowledgePage({ searchParams }: { searchParams: Promise<{ post?: string | string[] }> }) {
  const { post } = await searchParams;
  const { viewer } = await getViewer();
  const db = getDatabase();
  const material = typeof post === "string" ? loadMaterial(db, getDestination(db), viewer.id, post) : null;

  return (
    <PageShell back={{ href: "/chie", label: "校内の知恵" }} title="知恵に残す" className="chie">
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
    </PageShell>
  );
}
