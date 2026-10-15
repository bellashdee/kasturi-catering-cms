"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { LANGUAGE_COOKIE, isLanguage } from "@/lib/i18n/config";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Remembers the chosen language: on this device (cookie, also for people who are not signed in) and, for a signed-in person,
 * on their profile so it follows them to another device. Only the person's own profile row can be changed.
 */
export async function saveLanguage(language: string): Promise<{ ok: boolean }> {
  if (!isLanguage(language)) return { ok: false };
  (await cookies()).set(LANGUAGE_COOKIE, language, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update({ language }).eq("id", user.id);
  } catch {
    // the cookie is already saved; the profile copy is a convenience for other devices
  }
  return { ok: true };
}
