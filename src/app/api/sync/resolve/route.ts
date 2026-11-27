import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveConflict } from "@/lib/offline/server/dbLog";

export const runtime = "nodejs";

/** Records the person's choice on a conflict ("Keep mine" / "Keep the saved version"); both versions stay recorded. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { mutationId?: string; resolution?: string } | null;
  if (!body?.mutationId || (body.resolution !== "kept_mine" && body.resolution !== "kept_server")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    await resolveConflict(supabase, userId, body.mutationId, body.resolution);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_saved" }, { status: 500 });
  }
}
