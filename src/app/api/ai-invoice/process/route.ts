import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processClaimedJob } from "@/lib/invoiceReader/process";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The AI invoice worker: takes the next waiting job (or the one asked for) and reads it. One job per call keeps each call
 * inside the platform's 60-second limit; the dashboard calls it again while jobs are waiting, and a job a stopped call left
 * half-done goes back to the queue on its own (claim_ai_invoice_job). Runs as the signed-in user, so row-level security
 * limits it to that user's companies.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { jobId?: string } | null;
  const { data: claimed, error } = await supabase.rpc("claim_ai_invoice_job", { p_job_id: body?.jobId ?? null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const job = claimed?.[0];
  if (!job) return NextResponse.json({ idle: true });

  const outcome = await processClaimedJob(supabase, job, startedAt);
  return NextResponse.json(outcome);
}
