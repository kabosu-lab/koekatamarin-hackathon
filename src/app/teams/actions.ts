"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import { createDummyTeams } from "@/lib/destination/dummy-teams";
import { DEFAULT_PERSON_ID, PERSON_COOKIE } from "./person";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

async function viewerId(): Promise<string> {
  return (await cookies()).get(PERSON_COOKIE)?.value ?? DEFAULT_PERSON_ID;
}

function destination() {
  return createDummyTeams(getDatabase());
}

export async function switchPerson(form: FormData) {
  // ダミーの人物を切り替えるデモ用の仕組みで、本物のログインではない
  (await cookies()).set(PERSON_COOKIE, field(form, "personId"), { sameSite: "lax", path: "/" });
  revalidatePath("/teams");
}

export async function createPost(form: FormData) {
  destination().createPost(await viewerId(), field(form, "channelId"), field(form, "body"));
  revalidatePath("/teams");
}

export async function createReply(form: FormData) {
  destination().createReply(await viewerId(), field(form, "postId"), field(form, "body"));
  revalidatePath("/teams");
}

export async function toggleLike(form: FormData) {
  destination().toggleLike(await viewerId(), field(form, "postId"));
  revalidatePath("/teams");
}
