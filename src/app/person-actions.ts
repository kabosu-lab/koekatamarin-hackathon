"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { PERSON_COOKIE } from "@/lib/current-person";

export async function switchPerson(form: FormData) {
  const personId = form.get("personId");
  if (typeof personId !== "string") return;
  (await cookies()).set(PERSON_COOKIE, personId, { sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
