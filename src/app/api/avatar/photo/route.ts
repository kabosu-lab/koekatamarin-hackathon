import { getAvatar } from "@/lib/avatar";
import { catalogEntry } from "@/lib/avatar-catalog";
import { getPhotoAvatarState, handleAvatarFromPhoto } from "@/lib/avatar-art";
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

/** 本人の写真と、選んでいる途中の様子。写真はその場で読むだけで保存しない。 */
export async function GET(request: Request) {
  const { viewer } = await getViewer();
  const photos = createDummyPhotos();
  if (new URL(request.url).searchParams.has("image")) {
    const photo = await photos.getPhoto(viewer.id);
    if (!photo) return new Response("見つかりません", { status: 404 });
    return new Response(Buffer.from(photo.bytes), {
      headers: { "Content-Type": photo.mediaType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
  const db = getDatabase();
  const state = await getPhotoAvatarState(db, photos, viewer.id);
  const avatar = getAvatar(db, viewer.id);
  const entry = catalogEntry(avatar.family);
  return Response.json(
    { status: state.status, talent: state.talent, reason: state.reason, image: avatar.image, name: entry?.name ?? "", color: entry?.color ?? "#ff6b4a" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
