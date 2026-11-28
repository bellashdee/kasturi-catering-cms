"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { AutoCountInvoiceField } from "@/components/procurement/AutoCountInvoiceField";
import { useAllRestaurant } from "@/components/layout/RestaurantView";
import { AiInvoiceQueueRunner } from "@/components/aiInvoice/AiInvoiceUpload";
import { FORMAT_LABEL, type InvoiceFormat } from "@/lib/invoiceReader/detect";
import { DATE_FIELDS, FIELD_LABEL, HEADER_FIELDS, LINE_CATEGORIES, MONEY_FIELDS, type CanonicalInvoice, type FieldInfo, type HeaderField, type InvoiceLine } from "@/lib/invoiceReader/schema";
import type { EditedInvoice, StoredChecks } from "@/lib/invoiceReader/process";
import { aiInvoiceFileUrl, approveAiInvoice, overrideAiInvoiceDuplicate, rejectAiInvoice, reprocessAiInvoice, saveAiInvoiceEdits } from "@/lib/invoiceReader/actions";

type Job = {
  id: string;
  companyId: string;
  companyName: string;
  filename: string;
  format: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  errorRecovery: string | null;
  provider: string | null;
  model: string | null;
  duplicateOverride: boolean;
  supplierInvoiceId: string | null;
  rejectReason: string | null;
};
type Report = {
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
type HistoryItem = { id: string; action: string; who: string; at: string; details: Record<string, unknown> | null };

const input = "h-9 w-full min-w-0 rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] outline-none focus:border-primary";
const label = "block text-[11.5px] font-semibold text-text-secondary";
const EDITABLE = ["extracted", "needs_review", "duplicate"];
const ACTION_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  processing_started: "Reading started",
  text_extracted: "Text taken out of the document",
  extracted: "Read by AI",
  retry_scheduled: "Reading failed, will retry",
  failed: "Reading failed",
  edited: "Edited",
  approved: "Approved & saved",
  rejected: "Rejected",
  reprocess_requested: "Sent to be read again",
  duplicate_overridden: "Confirmed not a duplicate",
};

function ConfidenceBadge({ info }: { info: FieldInfo | undefined }) {
  if (!info) return null;
  if (info.status === "absent") return <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10.5px] font-bold text-text-muted">Not found</span>;
  if (info.status === "unreadable") return <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10.5px] font-bold text-danger">Needs review</span>;
  const tone = info.confidence === "high" ? "bg-success/10 text-success" : info.confidence === "medium" ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger";
  const text = info.confidence === "high" ? "High" : info.confidence === "medium" ? "Medium" : "Low";
  return <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${tone}`}>{text}</span>;
}

const toInput = (v: string | number | null) => (v === null || v === undefined ? "" : String(v));

function OriginalViewer({ jobId, format, chatText }: { jobId: string; format: string; chatText: string | null }) {
  const [file, setFile] = useState<{ url: string; text: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rotate, setRotate] = useState(0);
  useEffect(() => {
    let stale = false;
    void aiInvoiceFileUrl(jobId).then((r) => {
      if (stale) return;
      if (r.ok) setFile({ url: r.url, text: r.text });
      else setError(r.error);
    });
    return () => {
      stale = true;
    };
  }, [jobId]);
  if (error) return <p className="p-4 text-[13px] text-danger">{error}</p>;
  if (!file) return <p className="p-4 text-[13px] text-text-muted">Opening the original…</p>;
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-3 text-[12.5px]">
        <a href={file.url} target="_blank" rel="noreferrer" className="font-semibold text-primary">Open the original in a new tab</a>
        {format === "image" && (
          <button onClick={() => setRotate((r) => (r + 90) % 360)} className="font-semibold text-primary">Rotate</button>
        )}
      </div>
      {format === "pdf" && <iframe src={file.url} title="Original invoice" className="h-[75vh] w-full rounded-lg border border-border" />}
      {format === "image" && (
        <div className="overflow-auto rounded-lg border border-border bg-surface-alt p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file.url} alt="Original invoice" style={{ transform: `rotate(${rotate}deg)` }} className="mx-auto max-h-[75vh] max-w-full object-contain transition-transform" />
        </div>
      )}
      {(format === "xml" || format === "word" || format === "word_legacy") && (
        <pre translate="no" className="max-h-[75vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-alt p-3 text-[11.5px] text-text">{file.text ?? "The text of this file is not available. Open the original above."}</pre>
      )}
      {(format === "excel" || format === "csv") && (
        <p className="rounded-lg border border-border bg-surface-alt p-3 text-[12.5px] text-text-secondary">Spreadsheets cannot be shown here. Open the original above; the cell of each value is shown next to it on the right (for example Sheet1!C12).</p>
      )}
      {chatText && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <div className="text-[12px] font-bold text-warning">Chat messages on the screenshot (not used as invoice values)</div>
          <p translate="no" className="mt-1 whitespace-pre-wrap text-[12px] text-text-secondary">{chatText}</p>
        </div>
      )}
    </div>
  );
}

export function AiInvoiceReview({
  job,
  original,
  edited: initialEdited,
  checks: initialChecks,
  report,
  suppliers,
  history,
}: {
  job: Job;
  original: { header?: CanonicalInvoice["header"]; lines?: InvoiceLine[] } | null;
  edited: EditedInvoice | null;
  checks: StoredChecks | null;
  report: Report;
  suppliers: { id: string; name: string }[];
  history: HistoryItem[];
}) {
  const router = useRouter();
  const [view, setView] = useState<"original" | "details">("details");
  const [edited, setEdited] = useState<EditedInvoice | null>(initialEdited);
  const [checks, setChecks] = useState<StoredChecks | null>(initialChecks);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ackWarnings, setAckWarnings] = useState(false);
  const [ackPo, setAckPo] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [dupReason, setDupReason] = useState("");
  const noAutoCount = useAllRestaurant([job.companyId]);
  const editable = EDITABLE.includes(job.status) && !!edited;
  const fields = report?.fields ?? {};

  // new values from the server (after a save, approval or a fresh reading) replace the working copy
  const [shown, setShown] = useState({ edited: initialEdited, checks: initialChecks });
  if (shown.edited !== initialEdited || shown.checks !== initialChecks) {
    setShown({ edited: initialEdited, checks: initialChecks });
    setEdited(initialEdited);
    setChecks(initialChecks);
    setDirty(false);
  }

  // while the file is being read, the page refreshes itself
  useEffect(() => {
    if (job.status !== "queued" && job.status !== "processing") return;
    const t = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(t);
  }, [job.status, router]);

  function setHeader(f: HeaderField, raw: string) {
    if (!edited) return;
    let value: string | number | null = raw.trim() === "" ? null : raw;
    if (MONEY_FIELDS.includes(f) && value !== null) {
      const n = Number(raw);
      value = Number.isFinite(n) ? n : raw;
    }
    setEdited({ ...edited, header: { ...edited.header, [f]: value } });
    setDirty(true);
  }
  function setLine(i: number, key: keyof InvoiceLine, raw: string) {
    if (!edited) return;
    const numeric = ["quantity", "unit_price", "discount", "tax_amount", "line_total"].includes(key);
    const value = raw.trim() === "" ? null : numeric ? (Number.isFinite(Number(raw)) ? Number(raw) : null) : raw;
    const lines = edited.lines.map((l, idx) => (idx === i ? { ...l, [key]: value } : l));
    setEdited({ ...edited, lines });
    setDirty(true);
  }
  function setMeta<K extends "supplierId" | "purchaseOrderId" | "autoCountInvoiceNo" | "department" | "remarks">(k: K, v: string) {
    if (!edited) return;
    setEdited({ ...edited, [k]: v.trim() === "" ? null : v });
    setDirty(true);
  }

  async function run(name: string, work: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, after?: (r: Record<string, unknown>) => void) {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      const r = await work();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else {
        after?.(r);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", () => saveAiInvoiceEdits(job.id, edited as EditedInvoice) as never, (r) => {
      setChecks(r.checks as StoredChecks);
      setDirty(false);
      setNotice("Saved. Every check was run again.");
    });
  const approve = () =>
    run("approve", () => approveAiInvoice(job.id, edited as EditedInvoice, { warnings: ackWarnings, poDifferences: ackPo }) as never, () => setNotice("Approved and saved to Invoices."));
  const reject = () => run("reject", () => rejectAiInvoice(job.id, rejectReason) as never);
  const reprocess = () => run("reprocess", () => reprocessAiInvoice(job.id) as never);
  const notDuplicate = () => run("dup", () => overrideAiInvoiceDuplicate(job.id, dupReason) as never);

  const problems = checks?.validation.filter((c) => !c.ok && c.severity !== "info") ?? [];
  const passed = checks?.validation.filter((c) => c.ok) ?? [];
  const needsAck = problems.length > 0 || (checks?.lowConfidenceFields.length ?? 0) > 0 || (checks ? !checks.company.reliable : false);
  const poDiffs = checks?.po.purchaseOrderId && !checks.po.matched ? checks.po.differences : [];

  const statusPanel = (() => {
    if (job.status === "queued" || job.status === "processing")
      return (
        <div className="flex flex-col gap-2">
          <AiInvoiceQueueRunner waiting={1} />
          <p className="text-[13px] text-text-secondary">{job.status === "processing" ? "The AI reader is reading this invoice now. Nothing is shown until it has finished." : `Waiting to be read${job.attempts > 0 ? ` (try ${job.attempts + 1} of ${job.maxAttempts})` : ""}.`}</p>
          {job.errorMessage && <p className="text-[12.5px] text-warning">{`Last try: ${job.errorMessage}`}</p>}
        </div>
      );
    if (job.status === "failed")
      return (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-4">
          <div className="text-[13.5px] font-bold text-danger">Reading failed</div>
          <p className="mt-1 text-[13px] text-text">{job.errorMessage}</p>
          {job.errorRecovery && <p className="mt-1 text-[13px] text-text-secondary">{job.errorRecovery}</p>}
          <div className="mt-3 flex flex-wrap gap-3">
            <button onClick={reprocess} disabled={!!busy} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">Read again</button>
            <Link href={`/supplier-procurement/invoices/new?company=${job.companyId}`} className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-text">Enter manually</Link>
          </div>
        </div>
      );
    if (job.status === "approved")
      return (
        <div className="rounded-lg border border-success/40 bg-success/5 p-4 text-[13px]">
          <span className="font-bold text-success">Approved and saved to Invoices.</span>{" "}
          {job.supplierInvoiceId && <Link href={`/supplier-procurement/invoices/${job.supplierInvoiceId}`} className="font-semibold text-primary">Open the saved invoice</Link>}
        </div>
      );
    if (job.status === "rejected")
      return (
        <div className="rounded-lg border border-border bg-surface-alt p-4 text-[13px]">
          <span className="font-bold text-text">Rejected.</span> <span className="text-text-secondary">{job.rejectReason}</span>
          <div className="mt-2"><button onClick={reprocess} disabled={!!busy} className="text-[13px] font-semibold text-primary">Read again</button></div>
        </div>
      );
    return null;
  })();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-text-secondary">
        <span translate="no" className="font-semibold text-text">{job.filename}</span>
        <span>{FORMAT_LABEL[job.format as InvoiceFormat] ?? job.format}</span>
        <span translate="no">{job.companyName}</span>
        {job.model && <span>{`Read by ${job.provider === "xml" ? "the XML reader (no AI)" : job.model}`}</span>}
        {report?.legibility && report.legibility !== "good" && report.legibility !== "unknown" && <span className="font-semibold text-warning">{`Legibility: ${report.legibility}`}</span>}
      </div>

      {/* mobile: one pane at a time */}
      <div className="flex gap-2 lg:hidden">
        {(["details", "original"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold ${view === v ? "border-primary bg-primary/5 text-primary" : "border-border text-text-secondary"}`}>
            {v === "details" ? "Extracted data" : "Original document"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className={`${view === "original" ? "block" : "hidden"} rounded-xl border border-border bg-surface p-3 shadow-sm lg:block`}>
          <OriginalViewer jobId={job.id} format={job.format} chatText={report?.chatText ?? null} />
        </div>

        <div className={`${view === "details" ? "flex" : "hidden"} min-w-0 flex-col gap-4 lg:flex`}>
          {statusPanel}
          {error && <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[13px] font-semibold text-danger">{error}</p>}
          {notice && <p className="rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-[13px] font-semibold text-success">{notice}</p>}

          {checks && edited && (
            <>
              {checks.duplicates.length > 0 && (
                <section className="rounded-xl border border-danger/40 bg-danger/5 p-4">
                  <h2 className="text-[14px] font-bold text-danger">Possible duplicate</h2>
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-text">
                    {checks.duplicates.map((d, i) => (
                      <li key={i}>
                        {d.message}{" "}
                        {d.jobId && <Link href={`/supplier-procurement/ai-invoices/${d.jobId}`} className="font-semibold text-primary">Open</Link>}
                        {d.supplierInvoiceId && <Link href={`/supplier-procurement/invoices/${d.supplierInvoiceId}`} className="font-semibold text-primary">Open</Link>}
                      </li>
                    ))}
                  </ul>
                  {checks.duplicates.some((d) => d.kind === "same_invoice_no") ? (
                    <p className="mt-2 text-[12.5px] font-semibold text-danger">An invoice with this number from this supplier is already saved, so this one cannot be saved again. Reject it (nothing is deleted), or correct the supplier / invoice no. if they were read wrongly.</p>
                  ) : (
                    <p className="mt-2 text-[12.5px] text-text-secondary">Nothing is deleted. Reject this copy if it is a duplicate; if it is not, write why and continue.</p>
                  )}
                  {editable && !job.duplicateOverride && job.status === "duplicate" && !checks.duplicates.some((d) => d.kind === "same_invoice_no") && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input value={dupReason} onChange={(e) => setDupReason(e.target.value)} placeholder="Why this is not a duplicate" className={`${input} max-w-sm`} />
                      <button onClick={notDuplicate} disabled={!!busy || !dupReason.trim()} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-semibold text-text disabled:opacity-60">Not a duplicate</button>
                    </div>
                  )}
                  {job.duplicateOverride && <p className="mt-1 text-[12.5px] font-semibold text-text">Confirmed not a duplicate.</p>}
                </section>
              )}

              {(problems.length > 0 || checks.lowConfidenceFields.length > 0 || (report?.issues?.length ?? 0) > 0 || report?.typeWarning || !checks.company.reliable || checks.company.message.includes("but it was uploaded under")) && (
                <section className="rounded-xl border border-warning/40 bg-warning/5 p-4">
                  <h2 className="text-[14px] font-bold text-warning">Check these against the original</h2>
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-text">
                    {report?.typeWarning && <li>{report.typeWarning}</li>}
                    {(!checks.company.reliable || checks.company.message.includes("but it was uploaded under")) && <li>{checks.company.message}</li>}
                    {problems.map((c, i) => <li key={`p${i}`}>{c.message}</li>)}
                    {checks.lowConfidenceFields.length > 0 && <li>{`The reader is unsure of: ${checks.lowConfidenceFields.map((f) => FIELD_LABEL[f as HeaderField] ?? f).join(", ")}.`}</li>}
                    {report?.issues?.map((s, i) => <li key={`i${i}`}>{s}</li>)}
                  </ul>
                </section>
              )}

              {checks.validation.some((c) => !c.ok && c.severity === "info") && (
                <section className="rounded-xl border border-border bg-surface-alt px-4 py-3">
                  <h2 className="text-[13px] font-bold text-text">To complete before approval</h2>
                  <ul className="mt-1 list-disc pl-5 text-[12.5px] text-text-secondary">
                    {checks.validation.filter((c) => !c.ok && c.severity === "info").map((c, i) => <li key={i}>{c.message}</li>)}
                  </ul>
                </section>
              )}

              {passed.length > 0 && (
                <section className="rounded-xl border border-success/30 bg-success/5 px-4 py-3">
                  <ul className="text-[12.5px] text-success">
                    {passed.map((c, i) => <li key={i}>✓ {c.message}</li>)}
                    {checks.company.reliable && !checks.company.message.includes("but it was uploaded under") && <li>✓ {checks.company.message}</li>}
                  </ul>
                </section>
              )}
            </>
          )}

          {edited && (
            <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <h2 className="text-[14px] font-bold text-text">Invoice details</h2>
              <p className="mt-0.5 text-[12px] text-text-muted">Values as read from the invoice. Correct anything that differs from the original; nothing is filled in by guess. A value the reader did not find stays empty.</p>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={label}>Supplier (from the supplier list) *</label>
                  <Select value={edited.supplierId ?? ""} disabled={!editable} onChange={(e) => setMeta("supplierId", e.target.value)} className={`${input} mt-1`}>
                    <option value="">Choose the supplier</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  {checks?.supplier.candidates.length ? (
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[12px]">
                      <span className="text-text-muted">Suggested:</span>
                      {checks.supplier.candidates.map((c) => (
                        <button key={c.id} type="button" disabled={!editable} onClick={() => setMeta("supplierId", c.id)} className={`rounded-full border px-2 py-0.5 ${edited.supplierId === c.id ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary"}`}>
                          <span translate="no">{c.name}</span> · {c.reason}{c.invoiceCount ? ` · ${c.invoiceCount} invoices` : ""}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[12px] text-warning">No supplier in the list matches the printed name. Choose one (GENERAL SUPPLIER with the real name in the remarks if it is new), or add the supplier first.</p>
                  )}
                </div>

                {HEADER_FIELDS.map((f) => {
                  const info = fields[f];
                  const was = original?.header?.[f] ?? null;
                  const now = edited.header[f];
                  const changed = toInput(was) !== toInput(now);
                  return (
                    <div key={f} className={f === "description" || f === "supplier_name" || f === "bill_to_name" ? "sm:col-span-2" : ""}>
                      <div className="flex items-center gap-1.5">
                        <label className={label}>{FIELD_LABEL[f]}</label>
                        <ConfidenceBadge info={info} />
                        {info?.source && <span className="text-[10.5px] text-text-muted" translate="no">{info.source}</span>}
                      </div>
                      <input
                        type={DATE_FIELDS.includes(f) ? "date" : MONEY_FIELDS.includes(f) ? "number" : "text"}
                        step={MONEY_FIELDS.includes(f) ? "any" : undefined}
                        value={toInput(now)}
                        disabled={!editable}
                        onChange={(e) => setHeader(f, e.target.value)}
                        className={`${input} mt-1 ${info?.status === "unreadable" || info?.confidence === "low" ? "border-danger bg-danger/5" : info?.confidence === "medium" ? "border-warning" : ""}`}
                      />
                      {info?.printed && String(info.printed) !== toInput(now) && <p className="mt-0.5 text-[11px] text-text-muted">{`Printed: ${info.printed}`}</p>}
                      {changed && <p className="mt-0.5 text-[11px] text-primary">{`AI read: ${toInput(was) || "—"}`}</p>}
                      {info?.notes?.map((n, i) => <p key={i} className="mt-0.5 text-[11px] text-warning">{n}</p>)}
                    </div>
                  );
                })}

                {!noAutoCount && (
                  <div className="sm:col-span-2">
                    <AutoCountInvoiceField value={edited.autoCountInvoiceNo ?? ""} onChange={(v) => setMeta("autoCountInvoiceNo", v)} inputClassName={`${input} mt-1`} labelClassName={label} />
                  </div>
                )}
                <div>
                  <label className={label}>Department</label>
                  <input value={edited.department ?? ""} disabled={!editable} onChange={(e) => setMeta("department", e.target.value)} className={`${input} mt-1`} />
                </div>
                <div>
                  <label className={label}>Remarks</label>
                  <input value={edited.remarks ?? ""} disabled={!editable} onChange={(e) => setMeta("remarks", e.target.value)} className={`${input} mt-1`} />
                </div>
              </div>
            </section>
          )}

          {edited && (
            <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-bold text-text">{`Items (${edited.lines.length})`}</h2>
                {editable && (
                  <button
                    type="button"
                    onClick={() => {
                      setEdited({ ...edited, lines: [...edited.lines, { item_code: null, description: null, category: null, quantity: null, unit: null, unit_price: null, discount: null, tax_amount: null, line_total: null, source: "Added by reviewer", confidence: null }] });
                      setDirty(true);
                    }}
                    className="text-[12.5px] font-semibold text-primary"
                  >
                    + Add line
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-[12px] text-text-muted">Each line exactly as printed. The category is only a suggestion; the description stays as printed.</p>
              <div className="mt-2 overflow-x-auto">
                <div className="grid min-w-[860px] grid-cols-[4.5rem_minmax(0,2.4fr)_6.5rem_4.5rem_4rem_5rem_4.5rem_5.5rem_4.5rem] items-center gap-x-1.5 gap-y-1.5">
                  {["Code", "Description (as printed)", "Category", "Qty", "Unit", "Unit price", "Discount", "Amount", ""].map((h, i) => (
                    <div key={i} className="truncate text-[10.5px] font-bold uppercase tracking-wide text-text-muted">{h}</div>
                  ))}
                  {edited.lines.map((l, i) => {
                    const was = original?.lines?.[i];
                    return (
                      <Fragment key={i}>
                        <input aria-label="Code" value={toInput(l.item_code)} disabled={!editable} onChange={(e) => setLine(i, "item_code", e.target.value)} className={input} />
                        <div className="min-w-0">
                          <input aria-label="Description" value={toInput(l.description)} disabled={!editable} onChange={(e) => setLine(i, "description", e.target.value)} className={`${input} ${l.confidence === "low" ? "border-danger bg-danger/5" : ""}`} />
                          <div className="mt-0.5 truncate text-[10.5px] text-text-muted" translate="no">{[l.source, was && was.description !== l.description ? `AI read: ${was.description ?? "—"}` : null].filter(Boolean).join(" · ")}</div>
                        </div>
                        <Select aria-label="Category" value={l.category ?? ""} disabled={!editable} onChange={(e) => setLine(i, "category", e.target.value)} className={input}>
                          <option value="">—</option>
                          {LINE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </Select>
                        <input aria-label="Qty" type="number" step="any" value={toInput(l.quantity)} disabled={!editable} onChange={(e) => setLine(i, "quantity", e.target.value)} className={input} />
                        <input aria-label="Unit" value={toInput(l.unit)} disabled={!editable} onChange={(e) => setLine(i, "unit", e.target.value)} className={input} />
                        <input aria-label="Unit price" type="number" step="any" value={toInput(l.unit_price)} disabled={!editable} onChange={(e) => setLine(i, "unit_price", e.target.value)} className={input} />
                        <input aria-label="Discount" type="number" step="any" value={toInput(l.discount)} disabled={!editable} onChange={(e) => setLine(i, "discount", e.target.value)} className={input} />
                        <input aria-label="Amount" type="number" step="any" value={toInput(l.line_total)} disabled={!editable} onChange={(e) => setLine(i, "line_total", e.target.value)} className={input} />
                        {editable ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEdited({ ...edited, lines: edited.lines.filter((_, x) => x !== i) });
                              setDirty(true);
                            }}
                            className="text-[11.5px] font-semibold text-danger"
                          >
                            Remove
                          </button>
                        ) : (
                          <span />
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {checks && edited && (checks.po.purchaseOrderId || checks.po.candidates.length > 0 || checks.po.summary) && (
            <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <h2 className="text-[14px] font-bold text-text">Purchase order</h2>
              {checks.po.summary && <p className={`mt-1 text-[13px] ${checks.po.matched ? "text-success" : "text-warning"}`}>{checks.po.summary}</p>}
              {poDiffs.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-[12.5px] text-text">
                  {poDiffs.map((d, i) => (
                    <li key={i}><span translate="no">{d.line}{d.poLine && d.poLine !== d.line ? ` / ${d.poLine}` : ""}</span>: {d.issue}</li>
                  ))}
                </ul>
              )}
              {checks.po.candidates.length > 0 && (
                <div className="mt-2">
                  <label className={label}>Link to purchase order</label>
                  <Select value={edited.purchaseOrderId ?? ""} disabled={!editable} onChange={(e) => setMeta("purchaseOrderId", e.target.value)} className={`${input} mt-1 max-w-md`}>
                    <option value="">No purchase order</option>
                    {checks.po.candidates.map((p) => <option key={p.id} value={p.id}>{`${p.po_number} · ${p.order_date}${p.total_amount !== null ? ` · RM ${p.total_amount.toFixed(2)}` : ""}`}</option>)}
                  </Select>
                  <p className="mt-1 text-[11.5px] text-text-muted">Save the changes to compare the invoice with the chosen purchase order.</p>
                </div>
              )}
            </section>
          )}

          {editable && (
            <section className="sticky bottom-0 z-10 rounded-xl border border-border bg-surface p-4 shadow-lg">
              {needsAck && (
                <label className="flex items-start gap-2 text-[13px] text-text">
                  <input type="checkbox" checked={ackWarnings} onChange={(e) => setAckWarnings(e.target.checked)} className="mt-0.5" />
                  I have checked every marked value and warning against the original invoice.
                </label>
              )}
              {poDiffs.length > 0 && (
                <label className="mt-1 flex items-start gap-2 text-[13px] text-text">
                  <input type="checkbox" checked={ackPo} onChange={(e) => setAckPo(e.target.checked)} className="mt-0.5" />
                  I have checked the differences with the purchase order.
                </label>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={save} disabled={!!busy || !dirty} className="rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text disabled:opacity-50">{busy === "save" ? "Saving…" : "Save changes"}</button>
                <button
                  onClick={approve}
                  disabled={!!busy || dirty || (job.status === "duplicate" && !job.duplicateOverride) || (needsAck && !ackWarnings) || (poDiffs.length > 0 && !ackPo)}
                  className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === "approve" ? "Saving…" : "Approve & Save"}
                </button>
                <button onClick={reprocess} disabled={!!busy} className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-text-secondary disabled:opacity-50">Read again</button>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason to reject" className={`${input} max-w-[14rem]`} />
                  <button onClick={reject} disabled={!!busy || !rejectReason.trim()} className="rounded-lg border border-danger/40 px-4 py-2 text-[13px] font-semibold text-danger disabled:opacity-50">Reject</button>
                </div>
              </div>
              {dirty && <p className="mt-2 text-[12px] text-warning">Save the changes first: the checks are run again on the saved values before approval.</p>}
            </section>
          )}

          {report?.pages && report.pages.length > 0 && (
            <details className="rounded-xl border border-border bg-surface p-4 text-[12.5px]">
              <summary className="cursor-pointer font-semibold text-text">{`Pages read (${report.pages.length})`}</summary>
              <ul className="mt-1 text-text-secondary">
                {report.pages.map((p, i) => <li key={i}><span translate="no">{p.page}</span>: {p.content}</li>)}
              </ul>
            </details>
          )}

          <details className="rounded-xl border border-border bg-surface p-4 text-[12.5px]">
            <summary className="cursor-pointer font-semibold text-text">{`History (${history.length})`}</summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {history.map((h) => (
                <li key={h.id} className="text-text-secondary">
                  <span className="font-semibold text-text">{ACTION_LABEL[h.action] ?? h.action}</span> · <span translate="no">{h.who}</span> · {new Date(h.at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}
                  {h.action === "edited" && h.details?.changes ? (
                    <span translate="no">{" — " + Object.entries(h.details.changes as Record<string, { from: unknown; to: unknown }>).map(([k, v]) => `${FIELD_LABEL[k as HeaderField] ?? k}: ${k === "lines" ? `${v.from} → ${v.to} lines` : `${String(v.from ?? "—")} → ${String(v.to ?? "—")}`}`).join("; ")}</span>
                  ) : null}
                  {(h.action === "failed" || h.action === "retry_scheduled" || h.action === "rejected" || h.action === "duplicate_overridden") && h.details ? (
                    <span>{" — " + String(h.details.message ?? h.details.reason ?? "")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
