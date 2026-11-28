import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { AiInvoiceReview } from "@/components/aiInvoice/AiInvoiceReview";
import type { EditedInvoice, StoredChecks } from "@/lib/invoiceReader/process";
import type { CanonicalInvoice } from "@/lib/invoiceReader/schema";

export default async function AiInvoiceReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { id } = await params;
  const supabase = await createClient();
  const { data: job } = await supabase.from("ai_invoice_jobs").select("*").eq("id", id).maybeSingle();
  if (!job) notFound();

  const [{ data: suppliers }, { data: company }, { data: events }] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("company_id", job.company_id).order("name"),
    supabase.from("companies").select("id, name").eq("id", job.company_id).single(),
    supabase.from("ai_invoice_events").select("id, action, actor, details, created_at").eq("job_id", job.id).order("created_at"),
  ]);
  const actorIds = Array.from(new Set((events ?? []).map((e) => e.actor).filter((a): a is string => !!a)));
  const { data: people } = actorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? ""]));

  const report = (job.report ?? null) as {
    format?: string;
    legibility?: string;
    pages?: { page: string; content: string }[];
    issues?: string[];
    fields?: CanonicalInvoice["fields"];
    chatText?: string | null;
    isChatScreenshot?: boolean;
    documentType?: string | null;
    typeWarning?: string | null;
    valuesWithheld?: boolean;
  } | null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/supplier-procurement/ai-invoices?tab=${job.status === "queued" || job.status === "processing" ? "queue" : job.status === "needs_review" ? "review" : job.status === "rejected" ? "history" : job.status}`} className="text-[12.5px] font-semibold text-primary">
          ← AI Invoice Reader
        </Link>
        <h1 className="mt-1 text-[20px] font-extrabold text-text">Check invoice</h1>
      </div>
      <AiInvoiceReview
        job={{
          id: job.id,
          companyId: job.company_id,
          companyName: company?.name ?? "",
          filename: job.original_filename,
          format: job.detected_format ?? "unsupported",
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.max_attempts,
          errorMessage: job.error_message,
          errorRecovery: job.error_recovery,
          provider: job.provider,
          model: job.model,
          duplicateOverride: job.duplicate_override,
          supplierInvoiceId: job.supplier_invoice_id,
          rejectReason: job.reject_reason,
        }}
        original={(job.original as { header?: CanonicalInvoice["header"]; lines?: CanonicalInvoice["lines"] } | null) ?? null}
        edited={(job.edited as unknown as EditedInvoice | null) ?? null}
        checks={(job.checks as unknown as StoredChecks | null) ?? null}
        report={report}
        suppliers={suppliers ?? []}
        history={(events ?? []).map((e) => ({ id: e.id, action: e.action, who: e.actor ? nameOf.get(e.actor) || "—" : "System", at: e.created_at, details: e.details as Record<string, unknown> | null }))}
      />
    </div>
  );
}
