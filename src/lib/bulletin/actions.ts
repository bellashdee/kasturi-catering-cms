"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { BULLETIN_CATEGORIES, BULLETIN_REACTIONS, type BulletinCategory } from "@/lib/bulletin/constants";
import { todayInMalaysia } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";

export type BulletinInput = {
  companyId: string | null;
  title: string;
  body: string;
  category: BulletinCategory;
  pinned: boolean;
  expiresOn?: string | null;
  /** the people mentioned (their user ids): each gets a notification on the bell */
  mentions?: string[];
};

export type BulletinRow = Database["public"]["Tables"]["bulletin_posts"]["Row"];

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
  const mentions = Array.from(new Set((input.mentions ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id))));
  if (mentions.length > 100) throw new Error("Mention at most 100 people.");
  return { company_id: input.companyId, title, body, category: input.category, pinned: input.pinned, expires_on: expiresOn, mentions };
}

function refresh() {
  revalidatePath("/bulletin");
  revalidatePath("/");
}

/** Local staff and the admins post, change and delete announcements; everybody else only reads (the database decides who may). */
export async function createBulletinPost(input: BulletinInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId, name } = await session();
    const { error } = await supabase.from("bulletin_posts").insert({ ...clean(input), created_by: userId, created_by_name: name } as never);
    if (error) throw new Error("You cannot post to this company. Only local staff and the admins can post.");
    refresh();
    return {};
  });
}

export async function updateBulletinPost(id: string, input: BulletinInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await session();
    const { data, error } = await supabase.from("bulletin_posts").update(clean(input) as never).eq("id", id).select("id");
    if (error || !data?.length) throw new Error("You cannot change this announcement.");
    refresh();
    return {};
  });
}

export async function setBulletinPinned(id: string, pinned: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await session();
    const { data, error } = await supabase.from("bulletin_posts").update({ pinned }).eq("id", id).select("id");
    if (error || !data?.length) throw new Error("You cannot change this announcement.");
    refresh();
    return {};
  });
}

/** Deletes an announcement and returns it, so it can be put back with Undo. */
export async function deleteBulletinPost(id: string): Promise<ActionResult<{ row: BulletinRow }>> {
  return runAction(async () => {
    const { supabase } = await session();
    const { data, error } = await supabase.from("bulletin_posts").delete().eq("id", id).select("*");
    if (error || !data?.length) throw new Error("You cannot delete this announcement.");
    refresh();
    return { row: data[0] };
  });
}

/** Undo of a delete: the announcement comes back as it was (same text, date and author). */
export async function restoreBulletinPost(row: BulletinRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await session();
    if (!row?.id || !row.title || !row.body) throw new Error("There is nothing to put back.");
    const { error } = await supabase.from("bulletin_posts").insert(row);
    if (error) throw new Error("You cannot put this announcement back.");
    refresh();
    return {};
  });
}

/** Gives or takes back a reaction: everybody who can read the announcement may react (the database checks it). */
export async function toggleBulletinReaction(postId: string, emoji: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await session();
    if (!(BULLETIN_REACTIONS as readonly string[]).includes(emoji)) throw new Error("Choose one of the reactions.");
    const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: mine } = await db.from("bulletin_reactions").select("post_id").eq("post_id", postId).eq("user_id", userId).eq("emoji", emoji).maybeSingle();
    const { error } = mine
      ? await db.from("bulletin_reactions").delete().eq("post_id", postId).eq("user_id", userId).eq("emoji", emoji)
      : await db.from("bulletin_reactions").insert({ post_id: postId, user_id: userId, emoji });
    if (error) throw new Error("You cannot react to this announcement.");
    revalidatePath("/bulletin");
    return {};
  });
}
