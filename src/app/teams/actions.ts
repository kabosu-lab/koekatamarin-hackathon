"use server";

import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { getViewer } from "@/lib/current-person";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

async function viewerId(): Promise<string> {
  return (await getViewer()).viewer.id;
}

function destination() {
  return getDestination(getDatabase());
}

export async function createPost(form: FormData) {
  destination().createPost(await viewerId(), field(form, "channelId"), field(form, "body"));
  revalidatePath("/teams");
}

export async function createReply(form: FormData) {
  destination().createReply(await viewerId(), field(form, "postId"), field(form, "body"));
  revalidatePath("/teams");
}

export async function shareConcern(form: FormData) {
  destination().shareConcern(await viewerId(), field(form, "postId"));
  revalidatePath("/teams");
}

export async function toggleLike(form: FormData) {
  destination().toggleLike(await viewerId(), field(form, "postId"));
  revalidatePath("/teams");
}
