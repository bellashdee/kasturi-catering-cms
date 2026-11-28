import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { AiInvoiceUploadPanel, AiInvoiceQueueRunner } from "@/components/aiInvoice/AiInvoiceUpload";
import { FORMAT_LABEL, type InvoiceFormat } from "@/lib/invoiceReader/detect";

const TABS = [
  { key: "upload", label: "Upload", statuses: null },
  { key: "queue", label: "Processing Queue", statuses: ["queued", "processing"] },
  { key: "extracted", label: "Successfully Extracted", statuses: ["extracted"] },
  { key: "review", label: "Pending Verification", statuses: ["needs_review"] },
  { key: "failed", label: "Failed", statuses: ["failed"] },
  { key: "duplicate", label: "Duplicate Detection", statuses: ["duplicate"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "history", label: "History", statuses: null },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const STATUS_LABEL: Record<string, string> = {
  queued: "Pending AI processing",
  processing: "Reading…",
  extracted: "Extracted",
  needs_review: "Needs verification",
  duplicate: "Possible duplicate",
  failed: "Failed",
  approved: "Approved",
  rejected: "Rejected",
};
const STATUS_TONE: Record<string, string> = {
  queued: "bg-surface-alt text-text-secondary",
  processing: "bg-primary/10 text-primary",
  extracted: "bg-success/10 text-success",
  needs_review: "bg-warning/10 text-warning",
  duplicate: "bg-danger/10 text-danger",
  failed: "bg-danger/10 text-danger",
  approved: "bg-success/15 text-success",
  rejected: "bg-surface-alt text-text-muted",
};

/** uploaded in the last 24 hours */
function uploadedToday(createdAt: string): boolean {
  return Date.now() - Date.parse(createdAt) < 86_400_000;
}

export default async function AiInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; tab?: string; q?: string; from?: string; to?: string; min?: string; max?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const sp = await searchParams;
  const { targetCompanyIds, accessibleIds } = resolveCompanyScope(session, companies, sp.company);
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const tab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "upload") as TabKey;
  const { data: rows } = await supabase
    .from("ai_invoice_jobs")
    .select("id, company_id, original_filename, status, detected_format, supplier_name, invoice_number, invoice_date, total_amount, po_number, event_reference, created_at, error_message, error_recovery, attempts, max_attempts, next_attempt_at")
    .in("company_id", targetCompanyIds)
    .order("created_at", { ascending: false })
    .limit(1000);
  const jobs = rows ?? [];
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  const counts = Object.fromEntries(TABS.map((t) => [t.key, t.statuses ? jobs.filter((j) => (t.statuses as readonly string[]).includes(j.status)).length : t.key === "history" ? jobs.length : 0]));

  // search: supplier, invoice no., PO no., event reference, file name, company; invoice date range; amount range
  const q = (sp.q ?? "").trim().toLowerCase();
  const min = sp.min ? Number(sp.min) : null;
  const max = sp.max ? Number(sp.max) : null;
  const current = TABS.find((t) => t.key === tab)!;
  const listed = jobs.filter((j) => {
    if (current.statuses && !(current.statuses as readonly string[]).includes(j.status)) return false;
    if (tab === "upload") return ["queued", "processing"].includes(j.status) || uploadedToday(j.created_at);
    if (q) {
      const hay = [j.supplier_name, j.invoice_number, j.po_number, j.event_reference, j.original_filename, companyName.get(j.company_id)].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (sp.from && (!j.invoice_date || j.invoice_date < sp.from)) return false;
    if (sp.to && (!j.invoice_date || j.invoice_date > sp.to)) return false;
    if (min !== null && Number.isFinite(min) && (j.total_amount === null || Number(j.total_amount) < min)) return false;
    if (max !== null && Number.isFinite(max) && (j.total_amount === null || Number(j.total_amount) > max)) return false;
    return true;
  });
  const waiting = jobs.filter((j) => j.status === "queued" || j.status === "processing").length;
  const keep = sp.company ? `company=${sp.company}&` : "";
  const uploadCompanies = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = sp.company && accessibleIds.includes(sp.company) ? sp.company : targetCompanyIds.length === 1 ? targetCompanyIds[0] : "";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">AI Invoice Reader</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Supplier invoices read by AI wait here until a person checks and approves them. Nothing is saved to Invoices, finance or event costing before approval.</p>
      </div>
      <SupplierProcurementSubNav />

      <AiInvoiceQueueRunner waiting={waiting} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/supplier-procurement/ai-invoices?${keep}tab=${t.key}`}
            className={`rounded-xl border px-3 py-2.5 ${tab === t.key ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-alt"}`}
          >
            <div className="text-[11.5px] font-semibold text-text-secondary">{t.label}</div>
            <div className="text-[20px] font-extrabold text-text">{t.key === "upload" ? "+" : counts[t.key]}</div>
          </Link>
        ))}
      </div>

      {tab === "upload" && <AiInvoiceUploadPanel companies={uploadCompanies} defaultCompanyId={defaultCompanyId} />}

      {tab !== "upload" && (
        <ListFilters keep={{ company: sp.company, tab }} clearHref={`/supplier-procurement/ai-invoices?${keep}tab=${tab}`}>
          <FilterField label="Search">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Supplier, invoice no., PO no., event ref." className={`${FILTER_INPUT} w-72`} />
          </FilterField>
          <FilterField label="Invoice date from">
            <input type="date" name="from" defaultValue={sp.from ?? ""} className={`${FILTER_INPUT} w-40`} />
          </FilterField>
          <FilterField label="To">
            <input type="date" name="to" defaultValue={sp.to ?? ""} className={`${FILTER_INPUT} w-40`} />
          </FilterField>
          <FilterField label="Amount from">
            <input type="number" step="0.01" name="min" defaultValue={sp.min ?? ""} className={`${FILTER_INPUT} w-28`} />
          </FilterField>
          <FilterField label="Amount to">
            <input type="number" step="0.01" name="max" defaultValue={sp.max ?? ""} className={`${FILTER_INPUT} w-28`} />
          </FilterField>
        </ListFilters>
      )}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {tab === "upload" && <div className="border-b border-border px-5 py-3 text-[13px] font-bold text-text">Uploaded in the last 24 hours</div>}
        {listed.length === 0 ? (
          <EmptyRow text={q || sp.from || sp.to || sp.min || sp.max ? "No invoices match these filters." : "Nothing here."} />
        ) : (
          <ul className="divide-y divide-border">
            {listed.map((j) => (
              <li key={j.id}>
                <Link href={`/supplier-procurement/ai-invoices/${j.id}`} className="grid grid-cols-1 gap-1 px-5 py-3 hover:bg-surface-alt md:grid-cols-[2fr_1.4fr_1fr_1fr_1fr_1.1fr] md:items-center md:gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-text" translate="no">{j.supplier_name ?? j.original_filename}</div>
                    <div className="truncate text-[12px] text-text-muted">
                      <span translate="no">{j.original_filename}</span> · {FORMAT_LABEL[(j.detected_format ?? "unsupported") as InvoiceFormat] ?? j.detected_format} · <span translate="no">{companyName.get(j.company_id)}</span>
                    </div>
                  </div>
                  <div className="text-[13px] text-text" translate="no">{j.invoice_number ?? "—"}{j.po_number ? <span className="text-text-muted"> · PO {j.po_number}</span> : null}</div>
                  <div className="text-[13px] text-text">{j.invoice_date ? formatMalaysiaDate(j.invoice_date) : "—"}</div>
                  <div className="text-[13px] font-semibold text-text">{j.total_amount !== null ? formatCurrency(Number(j.total_amount)) : "—"}</div>
                  <div className="text-[12px] text-text-muted">{formatMalaysiaDate(j.created_at.slice(0, 10))}</div>
                  <div className="flex flex-col items-start gap-0.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${STATUS_TONE[j.status]}`}>{STATUS_LABEL[j.status]}</span>
                    {j.status === "failed" && j.error_message && <span className="line-clamp-2 text-[11.5px] text-danger">{j.error_message}</span>}
                    {j.status === "queued" && j.attempts > 0 && <span className="text-[11.5px] text-text-muted">{`Retry ${j.attempts + 1} of ${j.max_attempts}`}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
