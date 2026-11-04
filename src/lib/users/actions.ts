"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import type { Database } from "@/lib/supabase/types";

type UserRole = Database["public"]["Enums"]["user_role"];

// Only a Super Admin who can open every company may manage members, so only they can hand out "All Companies".
async function requireSuperAdmin() {
  const session = await getSessionContext();
  if (!session) throw new Error("Not signed in.");
  if (session.role !== "super_admin" || !session.hasAllCompaniesAccess) throw new Error("Only a Super Admin can manage team members.");
  return session;
}

/** The company_id values to store: [null] = every company, otherwise one row per chosen company. */
function companyGrants(role: UserRole, allCompanies: boolean, companyIds: string[]): (string | null)[] {
  if (role === "super_admin" || allCompanies) return [null];
  const unique = [...new Set(companyIds)];
  if (unique.length === 0) throw new Error("Choose at least one company, or All companies.");
  return unique;
}

export type CreateMemberInput = {
  fullName: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  /** true = every company (Super Admin only ever gets this). */
  allCompanies: boolean;
  companyIds: string[];
  /** null = every module. */
  allowedModules?: string[] | null;
  /** may open the Main Dashboard (a Super Admin always may) */
  canViewMainDashboard?: boolean;
};

export async function createMember(input: CreateMemberInput) {
  await requireSuperAdmin();
  const grants = companyGrants(input.role, input.allCompanies, input.companyIds);
  const admin = createAdminClient();

  const { data: existingUsername } = await admin.from("profiles").select("id").eq("username", input.username).maybeSingle();
  if (existingUsername) throw new Error("That username is already taken.");

  // no email is needed: the person signs in with the username (a placeholder address that cannot receive mail is kept)
  const email = input.email.trim() || `${input.username.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")}@no-email.invalid`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (createError) throw createError;
  const userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").update({ username: input.username, can_view_main_dashboard: input.canViewMainDashboard === true }).eq("id", userId);
  if (profileError) throw profileError;

  const { error: accessError } = await admin.from("user_company_access").insert(
    grants.map((companyId) => ({
      user_id: userId,
      company_id: companyId,
      role: input.role,
      allowed_modules: input.allowedModules ?? null,
    })),
  );
  if (accessError) throw accessError;

  revalidatePath("/settings");
  return { id: userId };
}

export type UpdateMemberInput = {
  fullName?: string;
  username?: string;
  /** A new sign-in email. Left out (or blank) = the email stays as it is. */
  email?: string;
  role?: UserRole;
  allCompanies?: boolean;
  companyIds?: string[];
  /** null = every module; a list = only those modules. */
  allowedModules?: string[] | null;
  canViewMainDashboard?: boolean;
  newPassword?: string;
};

/** Returns the problem as a result (a thrown message is hidden in production), so "email already used" reaches the screen. */
export async function updateMember(userId: string, input: UpdateMemberInput): Promise<ActionResult> {
  return runAction(async () => {
    await applyMemberUpdate(userId, input);
    return {};
  });
}

async function applyMemberUpdate(userId: string, input: UpdateMemberInput) {
  const session = await requireSuperAdmin();
  const admin = createAdminClient();

  if (input.role !== undefined && userId === session.userId && input.role !== "super_admin") {
    throw new Error("You can't remove your own Super Admin access.");
  }
  const grants = input.role !== undefined ? companyGrants(input.role, input.allCompanies ?? false, input.companyIds ?? []) : null;

  if (input.username) {
    const { data: existingUsername } = await admin
      .from("profiles")
      .select("id")
      .eq("username", input.username)
      .neq("id", userId)
      .maybeSingle();
    if (existingUsername) throw new Error("That username is already taken.");
  }

  const newEmail = input.email?.trim().toLowerCase();
  if (newEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error("Enter a valid email address.");
    const { data: taken } = await admin.from("profiles").select("id").eq("email", newEmail).neq("id", userId).maybeSingle();
    if (taken) throw new Error("That email is already used by someone else.");
    const { error: authError } = await admin.auth.admin.updateUserById(userId, { email: newEmail, email_confirm: true });
    if (authError) throw authError;
    const { error: emailError } = await admin.from("profiles").update({ email: newEmail }).eq("id", userId);
    if (emailError) throw emailError;
  }

  if (input.fullName !== undefined || input.username !== undefined || input.canViewMainDashboard !== undefined) {
    const { error } = await admin
      .from("profiles")
      .update({
        ...(input.canViewMainDashboard !== undefined ? { can_view_main_dashboard: input.canViewMainDashboard } : {}),
        ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
        ...(input.username !== undefined ? { username: input.username || null } : {}),
      })
      .eq("id", userId);
    if (error) throw error;
  }

  if (input.role !== undefined && grants) {
    // keep the current module choice when the form did not send one
    let modules = input.allowedModules;
    if (modules === undefined) {
      const { data: current } = await admin.from("user_company_access").select("allowed_modules").eq("user_id", userId).limit(1).maybeSingle();
      modules = current?.allowed_modules ?? null;
    }
    const { error: deleteError } = await admin.from("user_company_access").delete().eq("user_id", userId);
    if (deleteError) throw deleteError;
    const { error } = await admin.from("user_company_access").insert(
      grants.map((companyId) => ({ user_id: userId, company_id: companyId, role: input.role!, allowed_modules: modules })),
    );
    if (error) throw error;
  }

  if (input.newPassword) {
    const { error } = await admin.auth.admin.updateUserById(userId, { password: input.newPassword });
    if (error) throw error;
  }

  revalidatePath("/settings");
}

export async function deleteMember(userId: string) {
  const session = await requireSuperAdmin();
  if (session.userId === userId) throw new Error("You can't delete your own account.");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;

  revalidatePath("/settings");
}

/**
 * Login accepts either an email or a username. RLS blocks anonymous reads
 * of `profiles`, so this runs server-side with the admin client — it only
 * ever returns an email string, never anything else about the account.
 */
export async function resolveLoginIdentifier(identifier: string): Promise<string> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return trimmed;

  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("email").eq("username", trimmed).maybeSingle();
  return data?.email ?? trimmed;
}
