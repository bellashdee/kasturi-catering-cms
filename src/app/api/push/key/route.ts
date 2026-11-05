import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { loadPushConfig } from "@/lib/push/send";

export const runtime = "nodejs";

/** The public key a phone or computer needs to switch notifications on (public by nature; only for a signed-in person). */
export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ publicKey: null }, { status: 401 });
  const config = await loadPushConfig();
  return NextResponse.json({ publicKey: config?.publicKey ?? null });
}
