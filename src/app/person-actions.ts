"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { APPEARANCE_COOKIES, isAppearanceValue } from "@/lib/appearance";
import { PERSON_COOKIE } from "@/lib/current-person";

export async function setAppearance(form: FormData) {
  const name = form.get("name");
  const value = form.get("value");
  if (typeof name !== "string" || typeof value !== "string" || !isAppearanceValue(name, value)) return;
  (await cookies()).set(APPEARANCE_COOKIES[name], value, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function switchPerson(form: FormData) {
  const personId = form.get("personId");
  if (typeof personId !== "string") return;
  (await cookies()).set(PERSON_COOKIE, personId, { sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
