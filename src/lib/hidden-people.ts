import type { DatabaseSync } from "node:sqlite";

export type HiddenPerson = { id: string; name: string; label: string };

/** しばらく出さない相手。相手には伝えず、本人の表示にだけ効く。 */
export function setHidden(db: DatabaseSync, viewerId: string, personId: string, hidden: boolean, now: Date): boolean {
  if (personId === viewerId) return false;
  const person = db.prepare("SELECT id FROM people WHERE id = ?").get(personId);
  if (!person) return false;
  if (hidden) {
    db.prepare("INSERT OR IGNORE INTO hidden_people (person_id, hidden_person_id, created_at) VALUES (?, ?, ?)").run(
      viewerId,
      personId,
      now.toISOString(),
    );
  } else {
    db.prepare("DELETE FROM hidden_people WHERE person_id = ? AND hidden_person_id = ?").run(viewerId, personId);
  }
  return true;
}

export function listHiddenIds(db: DatabaseSync, viewerId: string): Set<string> {
  const rows = db.prepare("SELECT hidden_person_id AS id FROM hidden_people WHERE person_id = ?").all(viewerId) as {
    id: string;
  }[];
  return new Set(rows.map((row) => row.id));
}

/** 本人が隠した相手の一覧。隠された側から見る手段は作らない。 */
export function listHiddenPeople(db: DatabaseSync, viewerId: string): HiddenPerson[] {
  return db
    .prepare(
      `SELECT p.id, p.name, p.label FROM hidden_people h JOIN people p ON p.id = h.hidden_person_id
       WHERE h.person_id = ? ORDER BY h.created_at, p.rowid`,
    )
    .all(viewerId)
    .map((row) => {
      const { id, name, label } = row as HiddenPerson;
      return { id, name, label };
    });
}
