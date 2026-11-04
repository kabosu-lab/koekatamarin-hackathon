/** 期間限定のイベント。期間はデータだけで決まる。提出版の日付はダミーで、今の時期にも見える。 */
export type SchoolEvent = {
  id: string;
  name: string;
  /** 桜の画面に添える一言 */
  message: string;
  ribbon: { id: string; name: string; description: string };
  /** 日本時間の日付（両端を含む） */
  start: string;
  end: string;
};

export const EVENTS: readonly SchoolEvent[] = [
  {
    id: "culture-festival",
    name: "文化祭",
    message: "文化祭の準備で、桜のまわりがにぎやかです。",
    ribbon: { id: "event-culture-festival", name: "文化祭の助っ人", description: "文化祭の時期に、誰かの力になった" },
    start: "2026-09-01",
    end: "2026-10-31",
  },
  {
    id: "exam-cheer",
    name: "テスト前の応援週間",
    message: "テスト前の応援週間です。花びらが多めに舞っています。",
    ribbon: { id: "event-exam-cheer", name: "応援週間の仲間", description: "応援週間に、誰かの力になった" },
    start: "2026-11-01",
    end: "2026-12-31",
  },
];

function japanDate(at: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(at);
}

export function isInEvent(event: Pick<SchoolEvent, "start" | "end">, at: Date): boolean {
  const day = japanDate(at);
  return day >= event.start && day <= event.end;
}

export function activeEvents(now: Date, events: readonly SchoolEvent[] = EVENTS): SchoolEvent[] {
  return events.filter((event) => isInEvent(event, now));
}
