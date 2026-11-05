"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { sendPushToUsers } from "@/lib/push/send";

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Remembers this device for the signed-in person: from now on notifications are sent to it. */
export async function savePushSubscription(sub: PushSubscriptionInput, userAgent: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Not signed in.");
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("This device did not give what is needed for notifications.");
    const supabase = (await createClient()) as unknown as SupabaseClient;
    // the same device used by another person later: the device now belongs to the person who switched it on last
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ user_id: session.userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent.slice(0, 300), last_seen_at: new Date().toISOString() }, { onConflict: "endpoint" });
    if (error) throw error;
    return {};
  }, "Could not switch on notifications for this device.");
}

/** Forgets this device: no more notifications to it. */
export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Not signed in.");
    const supabase = (await createClient()) as unknown as SupabaseClient;
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", session.userId);
    if (error) throw error;
    return {};
  }, "Could not switch off notifications for this device.");
}

/** A test notification to all the devices of the signed-in person. */
export async function sendTestPush(): Promise<ActionResult<{ sent: number; devices: number }>> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Not signed in.");
    const result = await sendPushToUsers([session.userId], { title: "Notifications are on", body: "You will be told here when something needs you.", url: "/", tag: "test" });
    return { sent: result.sent, devices: result.devices };
  }, "Could not send the test notification.");
}
