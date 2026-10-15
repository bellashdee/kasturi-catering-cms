"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REMINDER_DAY_CHOICES } from "@/lib/priority/reminders";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

/** Which reminder timings the signed-in person wants ("7 days before", "on the due date" ...) and whether to keep reminding after the deadline. */
export async function saveReminderSettings(input: { daysBefore: number[]; remindAfterDeadline: boolean }) {
  const { supabase, userId } = await requireUser();
  const days = Array.from(new Set(input.daysBefore)).filter((d) => (REMINDER_DAY_CHOICES as readonly number[]).includes(d)).sort((a, b) => b - a);
  const { error } = await supabase.from("priority_reminder_settings").upsert({ user_id: userId, days_before: days, remind_after_deadline: input.remindAfterDeadline }, { onConflict: "user_id" });
  if (error) throw error;
  revalidatePath("/priority-centre");
}

export async function markNotificationRead(id: string) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("priority_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).is("read_at", null);
  if (error) throw error;
  revalidatePath("/priority-centre");
}

export async function markAllNotificationsRead() {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("priority_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  if (error) throw error;
  revalidatePath("/priority-centre");
}
