"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fileTypeFromMime, uploadDocument } from "@/lib/documents/upload";
import { createReconciliation, saveStatementLines } from "@/lib/procurement/soaReconcileActions";

const inputClass = "mt-1 block h-10 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] text-text";
const SOA_ACCEPT = "application/pdf,image/*,.xlsx,.xls,.csv,.docx,.doc";

type Option = { id: string; name: string; companyId: string };

/**
 * Upload the supplier's SOA (PDF, scan, photo, Excel, Word) for one company, supplier and period. The file is kept as it is; the AI reader
 * reads its lines; then it is matched with our records of that company and supplier only.
 */
export function SoaReconcileStart({ companies, suppliers, defaultCompanyId, defaultStart, defaultEnd }: { companies: { id: string; name: string }[]; suppliers: Option[]; defaultCompanyId: string; defaultStart: string; defaultEnd: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [supplierId, setSupplierId] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useMemo(() => suppliers.filter((s) => s.companyId === companyId), [suppliers, companyId]);

  async function start_() {
    setError(null);
    if (!companyId || !supplierId) return setError("Choose the company and the supplier.");
    if (!file) return setError("Choose the supplier's SOA file.");
    if (!start || !end || end < start) return setError("Choose the SOA period (from and to).");
    try {
      setStep("Saving the SOA file…");
      const doc = await uploadDocument({ companyId, module: "supplier-procurement", fileType: fileTypeFromMime(file), file });
      setStep("Starting the reconciliation…");
      const created = await createReconciliation({ companyId, supplierId, periodStart: start, periodEnd: end, documentId: doc.id });
      if (!created.ok) throw new Error(created.error);
      setStep("The AI reader is reading the statement lines (up to a minute)…");
      let saved: Awaited<ReturnType<typeof saveStatementLines>>;
      try {
        const res = await fetch("/api/extract-document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: doc.id, kind: "supplier_soa" }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const note = [body.error, body.hint].filter(Boolean).join(" ") || "The statement could not be read.";
          saved = await saveStatementLines(created.id, { items: [], source: "failed", note: fileTypeFromMime(file) === "word" ? `${note} Word files: save the file as PDF and upload it again, or key in the lines.` : note });
        } else if (body.configured === false) {
          saved = await saveStatementLines(created.id, { items: [], source: "manual", note: body.message ?? "The AI reader is not set up: key in the lines." });
        } else {
          const x = (body.extracted ?? {}) as Record<string, unknown>;
          const issues = Array.isArray(body.report?.issues) ? (body.report.issues as string[]).join(" ") : "";
          saved = await saveStatementLines(created.id, {
            items: Array.isArray(x.items) ? (x.items as Record<string, unknown>[]) : [],
            openingBalance: x.opening_balance,
            closingBalance: x.closing_balance,
            statementDate: x.statement_date,
            source: "extracted",
            note: issues.slice(0, 1000),
          });
        }
      } catch {
        saved = await saveStatementLines(created.id, { items: [], source: "failed", note: "The connection dropped while the statement was being read. Read it again from the reconciliation page, or key in the lines." });
      }
      if (!saved.ok) throw new Error(saved.error);
      router.push(`/supplier-procurement/soa/reconcile/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setStep(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-[14px] font-bold text-text">New reconciliation: upload the supplier&apos;s SOA</div>
      <p className="mt-0.5 text-[12.5px] text-text-secondary">
        The supplier&apos;s statement is an external document: it is only compared with our records. It never creates an invoice and never changes our records.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-[12px] font-semibold text-text-secondary">
          Company
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setSupplierId(""); }} className={inputClass}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          Supplier
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
            <option value="">Choose…</option>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          SOA period from
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          SOA period to
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          Supplier&apos;s SOA file
          <input type="file" accept={SOA_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[12.5px]" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!!step} onClick={start_} className="h-10 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-60">
          Upload and read the SOA
        </button>
        {step && <span className="text-[12.5px] text-text-secondary">{step}</span>}
        {error && <span className="text-[12.5px] font-semibold text-danger">{error}</span>}
      </div>
    </div>
  );
}
