import { cookies } from "next/headers";
import { listPeople, resolveViewer, type Person } from "./people";
import { isTrialMode } from "./trial";

export const PERSON_COOKIE = "koekata_person";
/** 今使っているダミーの人物。デモ用の切り替えで、本物のログインではない。 */
export async function getViewer(): Promise<{ viewer: Person; people: Person[] }> {
  const people = listPeople();
  const selected = (await cookies()).get(PERSON_COOKIE)?.value;
  const viewer = resolveViewer(people, selected, isTrialMode());
  return { viewer, people };
}
