import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { planPush, type PushEvent } from "@/lib/push/recipients";
import { loadPushConfig, sendPushToUsers } from "@/lib/push/send";

export const runtime = "nodejs";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * The database calls this (a trigger, through pg_net) when something was added or changed that somebody has to be told about.
 * Only the database knows the secret. The notification goes to every device the right people switched notifications on for.
 */
export async function POST(request: Request) {
  const secret = (await loadPushConfig())?.secret;
  const given = request.headers.get("x-push-secret") ?? "";
  if (!secret || !same(given, secret)) return NextResponse.json({ ok: false }, { status: 401 });

  const event = (await request.json().catch(() => null)) as (Omit<PushEvent, "record" | "old"> & { record?: PushEvent["record"]; old?: PushEvent["old"] }) | null;
  if (!event?.table || !event.record) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const plan = await planPush({ table: event.table, op: event.op === "UPDATE" ? "UPDATE" : "INSERT", record: event.record, old: event.old ?? null });
    if (!plan || plan.userIds.length === 0) return NextResponse.json({ ok: true, sent: 0 });
    const result = await sendPushToUsers(plan.userIds, plan.payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.warn("push notify failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
