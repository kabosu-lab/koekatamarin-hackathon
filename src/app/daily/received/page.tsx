import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { listReceived } from "@/lib/daily";
import { getDatabase } from "@/lib/db";
import { RespondForm } from "./RespondForm";

import { BackLink } from "@/app/BackLink";
export const metadata: Metadata = { title: "届いた日報と日記｜こえかた" };
export const dynamic = "force-dynamic";

export default async function ReceivedPage() {
  const { viewer } = await getViewer();
  const reports = listReceived(getDatabase(), viewer.id);

  return (
    <main className="home">
      <BackLink href="/me">じぶんへもどる</BackLink>
      <header>
        <h1>届いた日報と日記</h1>
        <p>本人がチェックを付けて届けた項目だけが見えます。</p>
      </header>
      {reports.length === 0 ? (
        <p className="seen-note">届いているものはありません。</p>
      ) : (
        reports.map((report) => (
          <article className="card" key={report.reportId} aria-label={`${report.personName}さんから`}>
            <h2>
              {report.personName}（{report.personLabel}）
            </h2>
            <p className="muted">{report.date}</p>
            <ul>
              {report.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {report.responses.map((response) => (
              <p className="response-card" key={response.id}>
                <strong>{response.fromName}先生</strong>：{response.text}
              </p>
            ))}
            <RespondForm reportId={report.reportId} />
          </article>
        ))
      )}
    </main>
  );
}
