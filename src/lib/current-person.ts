import { cookies } from "next/headers";
import { listPeople, type Person } from "./people";

export const PERSON_COOKIE = "koekata_person";
const DEFAULT_PERSON_ID = "saeki";

/** 今使っているダミーの人物。デモ用の切り替えで、本物のログインではない。 */
export async function getViewer(): Promise<{ viewer: Person; people: Person[] }> {
  const people = listPeople();
  const selected = (await cookies()).get(PERSON_COOKIE)?.value;
  const viewer = people.find((p) => p.id === selected) ?? people.find((p) => p.id === DEFAULT_PERSON_ID) ?? people[0];
  return { viewer, people };
}
