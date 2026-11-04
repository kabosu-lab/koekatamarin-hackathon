import { getDatabase } from "./db";
import type { Role } from "./seed-data";

export type Person = {
  id: string;
  name: string;
  role: Role;
  label: string;
};

export function listPeople(): Person[] {
  return getDatabase().prepare("SELECT id, name, role, label FROM people ORDER BY rowid").all() as Person[];
}

const DEFAULT_PERSON_ID = "saeki";

/** 切り替えで選べる人物。試用では生徒だけ。先生や相談室の先生として操作させない。 */
export function selectablePeople(people: Person[], trial: boolean): Person[] {
  return trial ? people.filter((p) => p.role === "student") : people;
}

/** cookie の値から今の人物を決める。選べない人物の値は、書き換えられていても使わない。 */
export function resolveViewer(people: Person[], selected: string | undefined, trial: boolean): Person {
  const candidates = selectablePeople(people, trial);
  return candidates.find((p) => p.id === selected) ?? candidates.find((p) => p.id === DEFAULT_PERSON_ID) ?? candidates[0];
}
