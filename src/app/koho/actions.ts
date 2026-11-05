"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { answerKoho, askKoho } from "@/lib/koho";

function postIdOf(form: FormData): string {
  const value = form.get("postId");
  return typeof value === "string" ? value : "";
}

export async function askAuthor(form: FormData) {
  const { viewer } = await getViewer();
  askKoho(getDatabase(), viewer.id, postIdOf(form), new Date());
  revalidatePath("/koho");
}

export async function agreeKoho(form: FormData) {
  const { viewer } = await getViewer();
  answerKoho(getDatabase(), viewer.id, postIdOf(form), true, form.get("guardian") === "on");
  revalidatePath("/inbox");
}

export async function declineKoho(form: FormData) {
  const { viewer } = await getViewer();
  answerKoho(getDatabase(), viewer.id, postIdOf(form), false, false);
  revalidatePath("/inbox");
}
