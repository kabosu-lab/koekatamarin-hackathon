"use server";

import { catchUpAvatar } from "@/lib/avatar-evolve";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { APPEARANCE_COOKIES, isAppearanceValue } from "@/lib/appearance";
import { PERSON_COOKIE } from "@/lib/current-person";

export async function setAppearance(form: FormData) {
  const name = form.get("name");
  const value = form.get("value");
  if (typeof name !== "string" || typeof value !== "string" || !isAppearanceValue(name, value)) return;
  // 隠している間も育っている。切り替えたら、育った姿で出す
  if (name === "avatar" || name === "theme") catchUpAvatar(getDatabase(), (await getViewer()).viewer.id);
  (await cookies()).set(APPEARANCE_COOKIES[name], value, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function switchPerson(form: FormData) {
  const personId = form.get("personId");
  if (typeof personId !== "string") return;
  (await cookies()).set(PERSON_COOKIE, personId, { sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
