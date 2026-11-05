"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { listReplyNotices, markRepliesSeen } from "@/lib/reply-notices";

function shownIds(form: FormData): string[] {
  return form.getAll("replyId").filter((value): value is string => typeof value === "string");
}

export async function closeReplyNotice(form: FormData) {
  const { viewer } = await getViewer();
  markRepliesSeen(getDatabase(), viewer.id, shownIds(form));
  revalidatePath("/");
}

/** 行き先は送られた値を使わず、本人に届いている返事の中から決める。 */
export async function openReplyNotice(form: FormData) {
  const { viewer } = await getViewer();
  const db = getDatabase();
  const ids = shownIds(form);
  const target = listReplyNotices(db, viewer.id).find((notice) => ids.includes(notice.replyId));
  markRepliesSeen(db, viewer.id, ids);
  revalidatePath("/");
  redirect(target ? `/teams?channel=${encodeURIComponent(target.channelId)}#post-${target.postId}` : "/");
}
