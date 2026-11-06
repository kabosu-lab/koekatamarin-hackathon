import type { ReceivedReport } from "@/lib/daily";
import { RespondForm } from "./RespondForm";

/**
 * 届いた日報と日記（0-2b）。本人がチェックを付けて、管理職や担任に届けた項目だけ。
 * 公開の投稿ではないので、投稿の流れには混ぜず、受信箱の中の1つの段にまとめる。
 */
export function ReceivedReports({ reports }: { reports: ReceivedReport[] }) {
  if (reports.length === 0) return null;
  return (
    <section className="inbox-received" id="received" aria-label="届いた日報と日記">
      <h2>届いた日報と日記（{reports.length}）</h2>
      <p className="muted">本人がチェックを付けて届けた項目だけが見えます。</p>
      {reports.map((report) => (
        <article className="card" key={report.reportId} aria-label={`${report.personName}さんから`}>
          <h3>
            {report.personName}（{report.personLabel}）
          </h3>
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
      ))}
    </section>
  );
}
