import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sets the sign-in email of a login (Settings > Members) to the email written on the staff record in HR, so the two stay the same.
 * Throws a readable message when the email is not valid or is already used by another login, before anything else is saved.
 */
export async function setLoginEmail(userId: string, email: string) {
  const next = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) throw new Error("Enter a valid email address.");
  const admin = createAdminClient();
  const { data: current } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  if ((current?.email ?? "").toLowerCase() === next) return;
  const { data: taken } = await admin.from("profiles").select("id").eq("email", next).neq("id", userId).maybeSingle();
  if (taken) throw new Error("That email is already used by another login. The staff email was not changed.");
  const { error: authError } = await admin.auth.admin.updateUserById(userId, { email: next, email_confirm: true });
  if (authError) throw new Error(`The login email could not be changed: ${authError.message}`);
  const { error: profileError } = await admin.from("profiles").update({ email: next }).eq("id", userId);
  if (profileError) throw profileError;
}
