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
