import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { listAlertsFor } from "@/lib/safety";
import { isTrialMode } from "@/lib/trial";

import { PageShell } from "@/app/ui/PageShell";
export const metadata: Metadata = { title: "相談室への知らせ｜こえかた" };
export const dynamic = "force-dynamic";

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function SoudanPage() {
  const { viewer } = await getViewer();
  const alerts = listAlertsFor(getDatabase(), viewer.id);

  if (isTrialMode()) {
    return (
      <PageShell
        back={{ href: "/", label: "話す" }}
        title="相談室への知らせ"
        lead="これは試用なので、相談室に知らせは届きません。本当に困ったことは、先生や近くの大人に直接話してください。"
        className="soudan"
       />
    );
  }

  return (
    <PageShell
      back={{ href: "/", label: "話す" }}
      title="相談室への知らせ"
      lead={`${viewer.name}さんに届いているものだけが見えます。チームでどう共有するかは、相談室の先生が判断します。`}
      className="soudan"
    >
      <p>AI の判断には、見逃しも誤りもあります。人の見守りの代わりにはなりません。</p>

      {alerts.length === 0 ? (
        <p>届いている知らせはありません。</p>
      ) : (
        alerts.map((alert) => (
          <article key={alert.id} aria-label={`${alert.personName}さんについての知らせ`}>
            <p>
              <strong>{alert.personName}</strong>（{alert.personLabel}）
            </p>
            <p>{alert.summary}</p>
            {alert.disputedAt && <p>本人から「違うよ」と届いています。声をかけるかは相談室の先生が判断してください。</p>}
            <p className="meta">
              {timeFormat.format(new Date(alert.updatedAt))}
              {alert.recipients.length > 0 && `・本人が選んで伝えた先：${alert.recipients.join("、")}`}
            </p>
          </article>
        ))
      )}
    </PageShell>
  );
}
