import { getDatabase, readSchemaVersion } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  const db = getDatabase();
  const { count } = db.prepare("SELECT count(*) AS count FROM people").get() as { count: number };
  return Response.json({
    status: "ok",
    schemaVersion: readSchemaVersion(db),
    peopleCount: count,
  });
}
