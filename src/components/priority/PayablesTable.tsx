"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { APPROVAL_LABEL, APPROVAL_TONE, OPS_ALERT_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, PRIORITY_LABEL, PRIORITY_TONE, type PayableView } from "@/lib/priority/payables";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { BTN_SM, BTN_SM_GHOST, Pill } from "@/components/priority/ui";
import { PayableManager, fmtDate, type EventOption } from "@/components/priority/PayableManager";

const DATA_REQUIRED = <span className="font-semibold text-warning">Data Required</span>;

function viewHref(p: PayableView) {
  return p.type === "supplier_invoice" ? `/supplier-procurement/invoices/${p.id}` : `/finance/payments/${p.id}`;
}

function Balance({ p }: { p: PayableView }) {
  if (p.statusKey === "paid") return <span className="text-[15px] font-extrabold text-success">{formatPrice(0)}</span>;
  if (p.verification === "verified") return <span className="text-[15px] font-extrabold text-text">{formatPrice(p.outstanding)}</span>;
  return (
    <span className="block">
      <span className="block text-[12px] font-bold text-warning">Pending Verification</span>
      <span className="text-[13px] text-text-secondary">({formatPrice(p.outstanding)} unverified)</span>
    </span>
  );
}

function Notes({ p }: { p: PayableView }) {
  const parts = [p.control?.holdReason && `${p.control.holdStatus === "disputed" ? "Disputed" : "On hold"}: ${p.control.holdReason}`, p.control?.notes, p.remarks].filter(Boolean) as string[];
  return parts.length ? <span className="line-clamp-3 text-[13px] text-text-secondary">{parts.join(" · ")}</span> : <span className="text-text-muted">—</span>;
}

function Docs({ p }: { p: PayableView }) {
  if (p.documents.length === 0) return <span className="text-text-muted">None</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {p.documents.slice(0, 3).map((d) => (
        <DocumentViewLink key={d.id} documentId={d.id} label={d.label.length > 22 ? `${d.label.slice(0, 20)}…` : d.label} />
      ))}
      {p.documents.length > 3 && <span className="text-[12px] text-text-muted">+{p.documents.length - 3} more</span>}
    </span>
  );
}

function Actions({ p, isApprover, onManage }: { p: PayableView; isApprover: boolean; onManage: () => void }) {
  const pending = p.openRequests.some((l) => l.status === "pending");
  return (
    <span className="flex flex-wrap gap-1.5">
      <button type="button" className={pending && isApprover ? BTN_SM : BTN_SM_GHOST} onClick={onManage}>
        {pending && isApprover ? "Review" : "Manage"}
      </button>
      <Link href={viewHref(p)} className={BTN_SM_GHOST}>View</Link>
    </span>
  );
}

const HEADERS = ["Priority", "Supplier", "Company", "Invoice / Ref", "Invoice date", "Due date", "Invoice amount (RM)", "Paid (RM)", "Confirmed outstanding (RM)", "Payment status", "Approval", "Notes", "Documents", "Action"];

/** Rows drawn at first; the list is sorted most urgent first. About a thousand unpaid payables drawn at once made the page several MB. */
const PAGE_ROWS = 100;

export function PayablesTable({ rows, isApprover, events }: { rows: PayableView[]; isApprover: boolean; events: EventOption[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_ROWS);
  const shown = rows.slice(0, limit);
  const rest = rows.length - shown.length;
  const current = selected ? rows.find((r) => `${r.type}:${r.id}` === selected) : undefined;

  if (rows.length === 0) {
    return <div className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-[14px] text-text-secondary">No supplier payments match these filters.</div>;
  }

  return (
    <>
      {/* wide screens: the full table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
        <table className="w-full min-w-[1500px] border-collapse text-left text-[13.5px]">
          <thead className="bg-surface-alt text-[12px] font-bold uppercase tracking-wide text-text-muted">
            <tr>
              {HEADERS.map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-3 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={`${p.type}:${p.id}`} className={`border-t border-border align-top ${p.priority === "urgent" ? "bg-danger-bg/30" : ""}`}>
                <td className="px-3 py-3.5">
                  {p.priority ? <Pill tone={PRIORITY_TONE[p.priority]}>{PRIORITY_LABEL[p.priority]}</Pill> : <Pill tone="success">Paid</Pill>}
                  <span className="mt-1 block max-w-[10rem] text-[12px] text-text-muted">{p.priorityReason}</span>
                </td>
                <td className="px-3 py-3.5 font-semibold text-text">
                  {p.supplierName}
                  {p.control?.opsAlertType && <span className="mt-1 block text-[12px] font-bold text-danger">⚠ {OPS_ALERT_LABEL[p.control.opsAlertType]}</span>}
                </td>
                <td className="px-3 py-3.5 text-text-secondary">{p.companyName}</td>
                <td className="px-3 py-3.5">{p.reference ?? DATA_REQUIRED}</td>
                <td className="whitespace-nowrap px-3 py-3.5">{p.invoiceDate ? fmtDate(p.invoiceDate) : DATA_REQUIRED}</td>
                <td className="whitespace-nowrap px-3 py-3.5">{p.dueDate ? fmtDate(p.dueDate) : DATA_REQUIRED}</td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">{formatPrice(p.amount)}</td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-success">{formatPrice(p.paidAmount)}</td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums"><Balance p={p} /></td>
                <td className="px-3 py-3.5"><Pill tone={PAYMENT_STATUS_TONE[p.statusKey]}>{PAYMENT_STATUS_LABEL[p.statusKey]}</Pill></td>
                <td className="px-3 py-3.5"><Pill tone={APPROVAL_TONE[p.approval]}>{APPROVAL_LABEL[p.approval]}</Pill></td>
                <td className="max-w-[14rem] px-3 py-3.5"><Notes p={p} /></td>
                <td className="px-3 py-3.5"><Docs p={p} /></td>
                <td className="px-3 py-3.5"><Actions p={p} isApprover={isApprover} onManage={() => setSelected(`${p.type}:${p.id}`)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* tablets and phones: one card per payment */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {shown.map((p) => (
          <li key={`${p.type}:${p.id}`} className={`rounded-lg border border-border p-3.5 ${p.priority === "urgent" ? "bg-danger-bg/30" : "bg-surface"}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              {p.priority ? <Pill tone={PRIORITY_TONE[p.priority]}>{PRIORITY_LABEL[p.priority]}</Pill> : <Pill tone="success">Paid</Pill>}
              <Pill tone={PAYMENT_STATUS_TONE[p.statusKey]}>{PAYMENT_STATUS_LABEL[p.statusKey]}</Pill>
              <Pill tone={APPROVAL_TONE[p.approval]}>{APPROVAL_LABEL[p.approval]}</Pill>
            </div>
            <div className="mt-2 text-[15px] font-bold text-text">{p.supplierName}</div>
            {p.control?.opsAlertType && <div className="text-[12.5px] font-bold text-danger">⚠ {OPS_ALERT_LABEL[p.control.opsAlertType]}</div>}
            <div className="text-[13px] text-text-secondary">{p.companyName} · {p.reference ?? DATA_REQUIRED}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
              <div><dt className="text-text-muted">Invoice date</dt><dd>{p.invoiceDate ? fmtDate(p.invoiceDate) : DATA_REQUIRED}</dd></div>
              <div><dt className="text-text-muted">Due date</dt><dd>{p.dueDate ? fmtDate(p.dueDate) : DATA_REQUIRED}</dd></div>
              <div><dt className="text-text-muted">Invoice amount</dt><dd className="tabular-nums">{formatPrice(p.amount)}</dd></div>
              <div><dt className="text-text-muted">Paid</dt><dd className="tabular-nums text-success">{formatPrice(p.paidAmount)}</dd></div>
              <div className="col-span-2"><dt className="text-text-muted">Confirmed outstanding</dt><dd><Balance p={p} /></dd></div>
              <div className="col-span-2"><dt className="text-text-muted">Notes</dt><dd><Notes p={p} /></dd></div>
              <div className="col-span-2"><dt className="text-text-muted">Documents</dt><dd><Docs p={p} /></dd></div>
            </dl>
            <div className="mt-3"><Actions p={p} isApprover={isApprover} onManage={() => setSelected(`${p.type}:${p.id}`)} /></div>
          </li>
        ))}
      </ul>

      {rest > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-text-secondary">{`Showing ${shown.length} of ${rows.length} (most urgent first)`}</span>
          <button type="button" onClick={() => setLimit((n) => n + PAGE_ROWS)} className={BTN_SM_GHOST}>{`Show ${Math.min(PAGE_ROWS, rest)} more`}</button>
          <button type="button" onClick={() => setLimit(rows.length)} className={BTN_SM_GHOST}>{`Show all ${rows.length}`}</button>
        </div>
      )}

      {current && <PayableManager key={selected} p={current} isApprover={isApprover} events={events} onClose={() => setSelected(null)} />}
    </>
  );
}
