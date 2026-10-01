"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth";
import type { Database } from "@/lib/supabase/types";

type UserRole = Database["public"]["Enums"]["user_role"];

async function requireSuperAdmin() {
  const session = await getSessionContext();
  if (!session) throw new Error("Not signed in.");
  if (session.role !== "super_admin") throw new Error("Only a Super Admin can manage team members.");
  return session;
}

export type CreateMemberInput = {
  fullName: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  companyId: string | null;
};

export async function createMember(input: CreateMemberInput) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: existingUsername } = await admin.from("profiles").select("id").eq("username", input.username).maybeSingle();
  if (existingUsername) throw new Error("That username is already taken.");

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (createError) throw createError;
  const userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").update({ username: input.username }).eq("id", userId);
  if (profileError) throw profileError;

  const { error: accessError } = await admin.from("user_company_access").insert({
    user_id: userId,
    company_id: input.companyId,
    role: input.role,
  });
  if (accessError) throw accessError;

  revalidatePath("/settings");
  return { id: userId };
}

export type UpdateMemberInput = {
  fullName?: string;
  username?: string;
  role?: UserRole;
  companyId?: string | null;
  newPassword?: string;
};

export async function updateMember(userId: string, input: UpdateMemberInput) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  if (input.username) {
    const { data: existingUsername } = await admin
      .from("profiles")
      .select("id")
      .eq("username", input.username)
      .neq("id", userId)
      .maybeSingle();
    if (existingUsername) throw new Error("That username is already taken.");
  }

  if (input.fullName !== undefined || input.username !== undefined) {
    const { error } = await admin
      .from("profiles")
      .update({
        ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
        ...(input.username !== undefined ? { username: input.username || null } : {}),
      })
      .eq("id", userId);
    if (error) throw error;
  }

  if (input.role !== undefined) {
    const { data: existingAccess } = await admin.from("user_company_access").select("id").eq("user_id", userId).maybeSingle();
    if (existingAccess) {
      const { error } = await admin
        .from("user_company_access")
        .update({ role: input.role, company_id: input.companyId ?? null })
        .eq("id", existingAccess.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from("user_company_access").insert({
        user_id: userId,
        company_id: input.companyId ?? null,
        role: input.role,
      });
      if (error) throw error;
    }
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
