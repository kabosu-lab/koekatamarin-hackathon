import { handleAvatarFromPhoto } from "@/lib/avatar-art";
import { createClaude } from "@/lib/claude";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { createDummyPhotos } from "@/lib/profile-photo/dummy";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const { status, body } = await handleAvatarFromPhoto(createClaude(), getDatabase(), createDummyPhotos(), viewer.id, input);
  return Response.json(body, { status });
}
