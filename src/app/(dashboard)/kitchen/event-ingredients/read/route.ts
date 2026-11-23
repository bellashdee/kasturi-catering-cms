import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { canAccessModule } from "@/lib/modules";
import { readEoText } from "@/lib/kitchenAi/eoFile";
import { parseEoText } from "@/lib/kitchenAi/eoMenu";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;

/** Reads an uploaded Event Order (Word or PDF) and returns the sessions (dishes and pax) found in it. Nothing is saved. */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  if (!canAccessModule(session.allowedModules, "kitchen")) return NextResponse.json({ ok: false, error: "You do not have access to Kitchen." }, { status: 403 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    const fallback = Number(form.get("fallbackPax"));
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file first." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "This file is too big (limit 4 MB). Save it smaller, or upload only the menu page." }, { status: 400 });
    const text = await readEoText(file.name, Buffer.from(await file.arrayBuffer()));
    const sessions = parseEoText(text, { fallbackPax: fallback > 0 ? fallback : null });
    if (sessions.length === 0) return NextResponse.json({ ok: false, error: "No dishes were found in this file. You can type the menu in below." }, { status: 200 });
    return NextResponse.json({ ok: true, fileName: file.name, sessions });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "This file could not be read." }, { status: 200 });
  }
}
