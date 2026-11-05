import { getDatabase } from "@/lib/db";
import { changeRoomMusic, getRoomMusic } from "@/lib/room-music";

export async function GET() {
  return Response.json(getRoomMusic(getDatabase(), new Date()));
}

export async function POST() {
  return Response.json(changeRoomMusic(getDatabase(), new Date()));
}
