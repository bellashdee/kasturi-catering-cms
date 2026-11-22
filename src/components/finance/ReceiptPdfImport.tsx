"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/StatusBadge";
import { formatPrice } from "@/lib/format";
import { readReceiptListing, saveReceiptPayments, type ReadReceiptsResult, type SaveReceiptsResult } from "@/lib/finance/receiptImportActions";
import type { Allocation, OpenInvoice, ReviewReceipt } from "@/lib/finance/receiptMatch";

const cents = (n: number) => Math.round(n * 100) / 100;
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const INPUT = "h-9 rounded-lg border border-border-strong bg-surface px-2 text-[13px]";

const STATUS: Record<ReviewReceipt["status"], { tone: "success" | "warning" | "danger" | "info" | "neutral"; label: string }> = {
  ready: { tone: "success", label: "Ready to save" },
  part_no_invoice: { tone: "warning", label: "Part has no invoice" },
  recorded: { tone: "neutral", label: "Already in the system" },
  partly_recorded: { tone: "warning", label: "Partly in the system" },
  no_invoice: { tone: "danger", label: "No unpaid invoice in the system" },
  no_customer: { tone: "danger", label: "Customer not found" },
};

type Row = {
  receipt: ReviewReceipt;
  checked: boolean;
  receiptNo: string;
  date: string;
  customerIds: string[];
  allocations: Allocation[];
};

type Batch = { data: ReadReceiptsResult; rows: Row[]; result?: SaveReceiptsResult; saving?: boolean; error?: string };

const startRows = (data: ReadReceiptsResult): Row[] =>
  data.receipts.map((r) => ({
    receipt: r,
    checked: r.status === "ready" || r.status === "part_no_invoice",
    receiptNo: r.docNo,
    date: r.date,
    customerIds: r.customerIds,
    allocations: r.suggestion.length ? r.suggestion : [],
  }));

export function ReceiptPdfImport({ companies }: { companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [companyId, setCompanyId] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);

  async function readFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const found: Batch[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      setReading(file.name);
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        problems.push(`${file.name}: choose a PDF file.`);
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      if (companyId) form.append("companyId", companyId);
      try {
        const res = await readReceiptListing(form);
        if (res.ok) {
          const { ok: _ok, ...data } = res;
          void _ok;
          found.push({ data, rows: startRows(data) });
        } else problems.push(`${file.name}: ${res.error}`);
      } catch {
        problems.push(`${file.name}: could not be read (the connection may have dropped). Try again.`);
      }
    }
    setReading(null);
    if (problems.length) setError(problems.join("\n"));
    setBatches((b) => [...found, ...b]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const update = (bi: number, fn: (b: Batch) => Batch) => setBatches((all) => all.map((b, i) => (i === bi ? fn(b) : b)));

  async function save(bi: number) {
    const batch = batches[bi];
    const items = batch.rows
      .filter((r) => r.checked)
      .map((r) => ({
        line: r.receipt.line,
        date: r.date,
        receiptNo: r.receiptNo,
        accountCode: r.receipt.accountCode,
        customerName: r.receipt.customerName,
        bankAccount: r.receipt.bankAccount,
        allocations: r.allocations.filter((a) => a.invoiceId && a.amount > 0),
      }));
    update(bi, (b) => ({ ...b, saving: true, error: undefined }));
    try {
      const res = await saveReceiptPayments({ companyId: batch.data.companyId, fileName: batch.data.fileName, items });
      if (res.ok) {
        const { ok: _ok, ...result } = res;
        void _ok;
        update(bi, (b) => ({ ...b, saving: false, result }));
        router.refresh();
      } else update(bi, (b) => ({ ...b, saving: false, error: res.error }));
    } catch {
      update(bi, (b) => ({ ...b, saving: false, error: "Could not save (the connection may have dropped). Check the invoices, then try again." }));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="text-[15px] font-bold text-text">Upload the AutoCount receipt listing (PDF)</div>
        <p className="mt-1 text-[13px] text-text-secondary">
          In AutoCount: A/R → Receive Payment → print the <b>AR Receive Payment Audit Trail Listing</b> for the month and save it as PDF. Upload it here: every receipt is read, matched to
          the customer&apos;s unpaid invoices and shown for checking. Nothing is saved until you press Save.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {companies.length > 1 && (
            <label className="flex flex-col text-[12px] font-semibold text-text-secondary">
              Company
              <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${INPUT} mt-1 w-64`}>
                <option value="">As printed on the report</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className={`inline-flex h-10 cursor-pointer items-center rounded-lg bg-primary px-4 text-[13.5px] font-bold text-white ${reading ? "pointer-events-none opacity-60" : ""}`}>
            {reading ? `Reading ${reading}…` : "Choose PDF file(s)"}
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => readFiles(e.target.files)} />
          </label>
        </div>
        {error && <div className="mt-3 whitespace-pre-line rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      </div>

      {batches.map((b, bi) => (
        <BatchView key={`${b.data.fileName}-${bi}`} batch={b} onChange={(fn) => update(bi, fn)} onSave={() => save(bi)} onClose={() => setBatches((all) => all.filter((_, i) => i !== bi))} />
      ))}
    </div>
  );
}

function BatchView({ batch, onChange, onSave, onClose }: { batch: Batch; onChange: (fn: (b: Batch) => Batch) => void; onSave: () => void; onClose: () => void }) {
  const { data, rows, result } = batch;
  const invoiceById = useMemo(() => new Map(data.invoices.map((i) => [i.id, i])), [data.invoices]);
  const customerName = useMemo(() => new Map(data.customers.map((c) => [c.id, c.name])), [data.customers]);

  // what is left to pay on each invoice after the ticked receipts of this file
  const applied = new Map<string, number>();
  for (const r of rows) if (r.checked) for (const a of r.allocations) if (a.invoiceId) applied.set(a.invoiceId, cents((applied.get(a.invoiceId) ?? 0) + (Number(a.amount) || 0)));
  const leftAfter = (id: string) => cents((invoiceById.get(id)?.outstanding ?? 0) - (applied.get(id) ?? 0));

  const setRow = (line: number, fn: (r: Row) => Row) => onChange((b) => ({ ...b, rows: b.rows.map((r) => (r.receipt.line === line ? fn(r) : r)) }));

  const total = cents(data.receipts.reduce((t, r) => t + r.amount, 0));
  const ticked = rows.filter((r) => r.checked);
  const toSave = cents(ticked.reduce((t, r) => t + r.allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0), 0));
  const overPaid = [...applied.keys()].filter((id) => leftAfter(id) < -0.005);
  const missingInvoice = ticked.filter((r) => !r.allocations.some((a) => a.invoiceId && a.amount > 0));
  const counts = rows.reduce<Record<string, number>>((c, r) => ((c[r.receipt.status] = (c[r.receipt.status] ?? 0) + 1), c), {});

  // the customers of this file: their unpaid invoices, and which of them this file pays
  const customerIds = [...new Set(rows.flatMap((r) => r.customerIds))];
  const customerInvoices = customerIds
    .map((cid) => ({ cid, invoices: data.invoices.filter((i) => i.customerId === cid) }))
    .filter((c) => c.invoices.length)
    .sort((a, b) => (customerName.get(a.cid) ?? "").localeCompare(customerName.get(b.cid) ?? ""));

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <div className="text-[15px] font-bold text-text">
            {data.companyName} · {data.listing.periodFrom ? `${dmy(data.listing.periodFrom)} – ${dmy(data.listing.periodTo ?? "")}` : data.fileName}
          </div>
          <div className="mt-0.5 text-[13px] text-text-secondary">
            <span translate="no">{data.fileName}</span> · {data.receipts.length} receipts · {formatPrice(total)}
            {data.listing.reportTotal !== null && (Math.abs(data.listing.reportTotal - total) < 0.005 ? " · same as the report total" : ` · report total ${formatPrice(data.listing.reportTotal)}`)}
            {data.readBy === "ai" ? " · read by AI" : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(STATUS) as ReviewReceipt["status"][]).filter((s) => counts[s]).map((s) => (
              <StatusBadge key={s} tone={STATUS[s].tone}>
                {STATUS[s].label}: {counts[s]}
              </StatusBadge>
            ))}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-[13px] font-semibold text-text-secondary hover:text-text">
          Close
        </button>
      </div>

      {data.warnings.map((w) => (
        <div key={w} className="mx-5 mt-3 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-warning">
          {w}
        </div>
      ))}
      {rows.some((r) => r.receipt.docNoCut) && (
        <div className="mx-5 mt-3 text-[12.5px] text-text-secondary">AutoCount cuts the receipt number short on this report (e.g. OR-KI2611/0). Type the full number if you want it on the payment; it is optional.</div>
      )}

      {result ? (
        <SaveResult result={result} />
      ) : (
        <>
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <ReceiptRow key={r.receipt.line} row={r} data={data} invoiceById={invoiceById} customerName={customerName} leftAfter={leftAfter} onChange={(fn) => setRow(r.receipt.line, fn)} />
            ))}
          </div>

          {customerInvoices.length > 0 && (
            <div className="border-t border-border px-5 py-4">
              <div className="text-[14px] font-bold text-text">Which invoices are paid and which are not</div>
              <p className="text-[12.5px] text-text-secondary">The unpaid invoices of the customers in this file, after the ticked receipts are saved.</p>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {customerInvoices.map(({ cid, invoices }) => (
                  <div key={cid} className="rounded-lg border border-border px-3 py-2">
                    <div className="text-[13.5px] font-bold text-text" translate="no">
                      {customerName.get(cid)}
                    </div>
                    {invoices.map((i) => {
                      const after = leftAfter(i.id);
                      const paying = applied.get(i.id) ?? 0;
                      return (
                        <div key={i.id} className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                          <Link href={`/finance/invoices/${i.id}`} target="_blank" className="font-semibold text-primary hover:underline" translate="no">
                            {i.invoiceNumber}
                          </Link>
                          <span className="text-text-secondary">{dmy(i.invoiceDate)} · owed {formatPrice(i.outstanding)}</span>
                          {paying > 0 && after <= 0.005 ? (
                            <StatusBadge tone="success">Paid by this file</StatusBadge>
                          ) : paying > 0 ? (
                            <StatusBadge tone="warning">Part paid · {formatPrice(after)} still owed</StatusBadge>
                          ) : (
                            <StatusBadge tone="danger">Not paid yet</StatusBadge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
            <div className="text-[13px] text-text-secondary">
              {ticked.length} receipt{ticked.length === 1 ? "" : "s"} ticked · {formatPrice(toSave)} will be recorded on the invoices
              {overPaid.length > 0 && <div className="mt-1 font-semibold text-danger">More than what is owed is set on {overPaid.map((id) => invoiceById.get(id)?.invoiceNumber).join(", ")}. Lower the amounts first.</div>}
              {missingInvoice.length > 0 && <div className="mt-1 font-semibold text-danger">Choose the invoice for every ticked receipt (or untick it).</div>}
              {batch.error && <div className="mt-1 font-semibold text-danger">{batch.error}</div>}
            </div>
            <button
              type="button"
              disabled={batch.saving || ticked.length === 0 || overPaid.length > 0 || missingInvoice.length > 0}
              onClick={onSave}
              className="h-10 rounded-lg bg-primary px-5 text-[13.5px] font-bold text-white disabled:opacity-50"
            >
              {batch.saving ? "Saving…" : `Save ${ticked.length} payment${ticked.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ReceiptRow({
  row,
  data,
  invoiceById,
  customerName,
  leftAfter,
  onChange,
}: {
  row: Row;
  data: ReadReceiptsResult;
  invoiceById: Map<string, OpenInvoice>;
  customerName: Map<string, string>;
  leftAfter: (id: string) => number;
  onChange: (fn: (r: Row) => Row) => void;
}) {
  const r = row.receipt;
  const linked = cents(row.allocations.reduce((t, a) => t + (Number(a.amount) || 0), 0));
  const notLinked = cents(r.amount - r.alreadyRecorded - linked);
  const own = data.invoices.filter((i) => row.customerIds.includes(i.customerId));
  const others = data.invoices.filter((i) => !row.customerIds.includes(i.customerId));
  const label = (i: OpenInvoice) => `${i.invoiceNumber} · ${dmy(i.invoiceDate)} · owed ${formatPrice(i.outstanding)}${row.customerIds.includes(i.customerId) ? "" : ` · ${customerName.get(i.customerId) ?? ""}`}`;
  const setAlloc = (k: number, patch: Partial<Allocation>) => onChange((x) => ({ ...x, allocations: x.allocations.map((a, i) => (i === k ? { ...a, ...patch } : a)) }));

  return (
    <div className={`px-5 py-3 ${row.checked ? "" : "bg-surface-alt"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input type="checkbox" checked={row.checked} onChange={(e) => onChange((x) => ({ ...x, checked: e.target.checked }))} className="h-4 w-4" aria-label="Save this receipt" />
        <input type="date" value={row.date} onChange={(e) => onChange((x) => ({ ...x, date: e.target.value }))} className={`${INPUT} w-36`} />
        <input value={row.receiptNo} onChange={(e) => onChange((x) => ({ ...x, receiptNo: e.target.value }))} className={`${INPUT} w-36`} placeholder="Receipt No." translate="no" />
        <div className="min-w-48 flex-1">
          <div className="text-[14px] font-bold text-text" translate="no">
            {r.customerName}
          </div>
          <div className="text-[12px] text-text-secondary">
            {r.accountCode}
            {r.customerMatch === "name" ? " · matched by name" : ""}
            {r.bankAccount ? ` · into ${r.bankAccount}` : ""}
          </div>
        </div>
        <div className="text-[15px] font-bold text-text">{formatPrice(r.amount)}</div>
        <StatusBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusBadge>
      </div>

      <div className="ml-7 mt-2 flex flex-col gap-1.5">
        {r.alreadyRecorded > 0 && (
          <div className="text-[12.5px] text-text-secondary">
            {formatPrice(r.alreadyRecorded)} is already recorded for this customer on {dmy(r.date)}
            {r.status === "recorded" ? " — this receipt is not saved again unless you tick it." : "."}
          </div>
        )}
        {r.status === "no_customer" && (
          <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-secondary">
            Customer in the system:
            <Select
              value={row.customerIds[0] ?? ""}
              onChange={(e) => onChange((x) => ({ ...x, customerIds: e.target.value ? [e.target.value] : [], allocations: [] }))}
              className={`${INPUT} w-72`}
            >
              <option value="">Choose the customer</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.accountCode ? ` (${c.accountCode})` : ""}
                </option>
              ))}
            </Select>
          </label>
        )}

        {row.allocations.map((a, k) => {
          const inv = invoiceById.get(a.invoiceId);
          const after = a.invoiceId ? leftAfter(a.invoiceId) : null;
          return (
            <div key={k} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-text-secondary">Pays</span>
              <Select value={a.invoiceId} onChange={(e) => setAlloc(k, { invoiceId: e.target.value })} className={`${INPUT} w-80`}>
                <option value="">Choose the invoice</option>
                {own.map((i) => (
                  <option key={i.id} value={i.id}>
                    {label(i)}
                  </option>
                ))}
                {others.map((i) => (
                  <option key={i.id} value={i.id}>
                    {label(i)}
                  </option>
                ))}
              </Select>
              <input type="number" min="0" step="0.01" value={a.amount} onChange={(e) => setAlloc(k, { amount: Number(e.target.value) })} className={`${INPUT} w-28`} aria-label="Amount (RM)" />
              {inv && row.checked && after !== null && (after < -0.005 ? <StatusBadge tone="danger">More than owed</StatusBadge> : after <= 0.005 ? <StatusBadge tone="success">→ Paid</StatusBadge> : <StatusBadge tone="warning">→ {formatPrice(after)} still owed</StatusBadge>)}
              <button type="button" onClick={() => onChange((x) => ({ ...x, allocations: x.allocations.filter((_, i) => i !== k) }))} className="text-[12.5px] font-semibold text-text-secondary hover:text-danger">
                Remove
              </button>
            </div>
          );
        })}
        {r.basis === "combination" && row.allocations.length > 0 && <div className="text-[12px] text-text-secondary">These unpaid invoices add up to exactly this receipt — check that they are the ones paid.</div>}
        {r.basis === "oldest" && row.allocations.length > 0 && <div className="text-[12px] text-text-secondary">No invoice of exactly this amount, so the oldest unpaid invoices were taken first — change them if the receipt paid other invoices.</div>}
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          {data.invoices.length > 0 && (
            <button
              type="button"
              onClick={() => onChange((x) => ({ ...x, checked: true, allocations: [...x.allocations, { invoiceId: "", amount: Math.max(0, notLinked) }] }))}
              className="font-semibold text-primary hover:underline"
            >
              + Add an invoice
            </button>
          )}
          {notLinked > 0.005 && r.status !== "recorded" && (
            <span className="text-warning">
              {formatPrice(notLinked)} is not on any invoice and is not saved{own.length === 0 ? " (the invoice is not in the system: a 2025 invoice or a deposit — add the invoice first, then upload again)" : ""}.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveResult({ result }: { result: SaveReceiptsResult }) {
  const label = { paid: "Paid", partially_paid: "Part paid", issued: "Not paid" } as Record<string, string>;
  return (
    <div className="px-5 py-4">
      <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13.5px] font-semibold text-success">
        {result.saved} payment{result.saved === 1 ? "" : "s"} saved · {formatPrice(result.savedAmount)}
      </div>
      {result.skipped.length > 0 && (
        <div className="mt-2 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-warning">
          Not saved:
          {result.skipped.map((s) => (
            <div key={s.line}>
              Receipt {s.line}: {s.reason}
            </div>
          ))}
        </div>
      )}
      {result.invoices.length > 0 && (
        <div className="mt-3">
          <div className="text-[14px] font-bold text-text">Invoices now</div>
          {result.invoices.map((i) => (
            <div key={i.id} className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
              <Link href={`/finance/invoices/${i.id}`} className="font-semibold text-primary hover:underline" translate="no">
                {i.invoiceNumber}
              </Link>
              <span className="text-text-secondary">
                {formatPrice(i.paid)} paid of {formatPrice(i.total)}
              </span>
              <StatusBadge tone={i.status === "paid" ? "success" : i.status === "partially_paid" ? "warning" : "danger"}>
                {label[i.status] ?? i.status}
                {i.outstanding > 0 ? ` · ${formatPrice(i.outstanding)} still owed` : ""}
              </StatusBadge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
