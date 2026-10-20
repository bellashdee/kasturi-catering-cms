"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BULLETIN_CATEGORIES, type BulletinCategory } from "@/lib/bulletin/constants";
import { todayInMalaysia } from "@/lib/format";

export type BulletinInput = {
  companyId: string | null;
  title: string;
  body: string;
  category: BulletinCategory;
  pinned: boolean;
  expiresOn?: string | null;
};

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  return { supabase, userId: user.id, name: profile?.full_name?.trim() || user.email || "" };
}

function clean(input: BulletinInput) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("Write a title.");
  if (title.length > 150) throw new Error("The title is too long (150 characters at most).");
  if (!body) throw new Error("Write the announcement.");
  if (body.length > 4000) throw new Error("The announcement is too long (4000 characters at most).");
  if (!BULLETIN_CATEGORIES.includes(input.category)) throw new Error("Choose a category.");
  const expiresOn = input.expiresOn?.trim() || null;
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) throw new Error("Choose a valid date.");
  if (expiresOn && expiresOn < todayInMalaysia()) throw new Error("The show-until date cannot be in the past.");
  return { company_id: input.companyId, title, body, category: input.category, pinned: input.pinned, expires_on: expiresOn };
}

function refresh() {
  revalidatePath("/bulletin");
  revalidatePath("/");
}

export async function createBulletinPost(input: BulletinInput) {
  const { supabase, userId, name } = await session();
  const { error } = await supabase.from("bulletin_posts").insert({ ...clean(input), created_by: userId, created_by_name: name });
  if (error) throw new Error("You cannot post to this company. Only Super Admin (all companies) and Company Admin (own company) can post.");
  refresh();
}

export async function updateBulletinPost(id: string, input: BulletinInput) {
  const { supabase } = await session();
  const { data, error } = await supabase.from("bulletin_posts").update(clean(input)).eq("id", id).select("id");
  if (error || !data?.length) throw new Error("You cannot change this announcement.");
  refresh();
}

export async function setBulletinPinned(id: string, pinned: boolean) {
  const { supabase } = await session();
  const { data, error } = await supabase.from("bulletin_posts").update({ pinned }).eq("id", id).select("id");
  if (error || !data?.length) throw new Error("You cannot change this announcement.");
  refresh();
}

export async function deleteBulletinPost(id: string) {
  const { supabase } = await session();
  const { data, error } = await supabase.from("bulletin_posts").delete().eq("id", id).select("id");
  if (error || !data?.length) throw new Error("You cannot delete this announcement.");
  refresh();
}
