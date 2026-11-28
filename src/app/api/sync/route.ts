import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processMutations } from "@/lib/offline/server/core";
import { databaseLog } from "@/lib/offline/server/dbLog";
import { SERVER_HANDLERS } from "@/lib/offline/server/handlers";
import type { SyncRequest, SyncResponse } from "@/lib/offline/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The offline queue of a device is sent here when it is back online. Every change is applied as the signed-in person (their own
 * Supabase session, so RLS decides what they may do: never the service role), in the order it was made, at most once.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "signed_out" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  let body: SyncRequest;
  try {
    body = (await request.json()) as SyncRequest;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const deviceId = typeof body?.deviceId === "string" && body.deviceId.trim() ? body.deviceId.trim().slice(0, 100) : "unknown";
  const outcomes = await processMutations({
    ctx: { supabase, userId },
    userId,
    deviceId,
    mutations: body?.mutations,
    handlers: SERVER_HANDLERS,
    log: databaseLog(supabase, userId),
  });
  const response: SyncResponse = { outcomes };
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
