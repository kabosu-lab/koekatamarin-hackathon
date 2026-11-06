import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { searchThanksPeople } from "@/lib/thanks-people";

/** サンクスカードの送り先を、名前や学年・教科の一部で絞る。空なら誰も返さない */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const { viewer } = await getViewer();
  return Response.json({ people: searchThanksPeople(getDatabase(), viewer.id, q.slice(0, 40)) });
}
