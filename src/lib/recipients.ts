import type { DatabaseSync } from "node:sqlite";

export type Recipient = { id: string; name: string };

/** 管理職や担任にあたる人。先生なら管理職、生徒なら担任。管理職自身には該当者がいない。 */
export function recipientsOf(db: DatabaseSync, personId: string): Recipient[] {
  const person = db.prepare("SELECT role, homeroom_teacher_id FROM people WHERE id = ?").get(personId) as
    | { role: string; homeroom_teacher_id: string | null }
    | undefined;
  if (!person) return [];
  if (person.role === "teacher") {
    return (db.prepare("SELECT id, name FROM people WHERE role = 'admin' ORDER BY rowid").all() as Recipient[]).map(
      ({ id, name }) => ({ id, name }),
    );
  }
  if (person.role === "student" && person.homeroom_teacher_id) {
    const teacher = db.prepare("SELECT id, name FROM people WHERE id = ?").get(person.homeroom_teacher_id) as Recipient;
    return [{ id: teacher.id, name: teacher.name }];
  }
  return [];
}
