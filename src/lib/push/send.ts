import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushPayload = {
  title: string;
  body?: string;
  /** the page that opens when the notification is pressed */
  url?: string;
  /** a notification with the same tag replaces the earlier one instead of piling up */
  tag?: string;
};

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

export type PushConfig = { publicKey: string; privateKey: string; subject: string; secret: string };

let cached: { at: number; config: PushConfig | null } | null = null;

/**
 * The keys of the notification service. They are kept in the database (table push_settings, which only the service role can read),
 * next to the secret the triggers send, so that switching notifications on needs nothing to be set on the server.
 */
export async function loadPushConfig(): Promise<PushConfig | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.config;
  const admin = createAdminClient() as unknown as SupabaseClient;
  const { data } = await admin.from("push_settings").select("key, value");
  const v = Object.fromEntries(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const config = v.vapid_public && v.vapid_private ? { publicKey: v.vapid_public, privateKey: v.vapid_private, subject: v.vapid_subject || "mailto:admin@kasturicatering.com.my", secret: v.secret ?? "" } : null;
  cached = { at: Date.now(), config };
  return config;
}

async function configure(): Promise<boolean> {
  const config = await loadPushConfig();
  if (!config) return false;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return true;
}

/**
 * Sends a notification to every device the given people switched notifications on for. A device that no longer exists (the
 * person removed the permission or the app) is forgotten. Never throws: a notification problem must not stop the work.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; failed: number; devices: number }> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0 || !(await configure())) return { sent: 0, failed: 0, devices: 0 };
  const admin = createAdminClient() as unknown as SupabaseClient;
  const { data } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids);
  const subs = (data ?? []) as Subscription[];
  const body = JSON.stringify({ title: payload.title, body: payload.body ?? "", url: payload.url ?? "/", tag: payload.tag });
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24, urgency: "high" });
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
      }
    }),
  );
  if (gone.length > 0) await admin.from("push_subscriptions").delete().in("id", gone);
  return { sent, failed, devices: subs.length };
}
