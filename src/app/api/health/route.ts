import { getDatabase, readSchemaVersion } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    schemaVersion: readSchemaVersion(getDatabase()),
  });
}
