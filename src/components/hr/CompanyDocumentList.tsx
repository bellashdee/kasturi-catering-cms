"use client";

import { useMemo, useState } from "react";
import { COMPANY_DOC_TYPE_LABEL } from "@/lib/hr/constants";
import { CompanyDocumentRow, type CompanyDocData } from "@/components/hr/CompanyDocumentRow";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { Select } from "@/components/ui/Select";

const STATUS_LABEL: Record<string, string> = {
  all: "All statuses",
  valid: "Valid",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  no_expiry: "No expiry",
};

const inputClass = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[11.5px] font-semibold text-text-secondary";

/** The Licences & Documents table with its filters: search (title, reference, notes), company, type and status. */
export function CompanyDocumentList({ docs }: { docs: CompanyDocData[] }) {
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const companies = useMemo(() => [...new Map(docs.map((d) => [d.companyId, d.companyName])).entries()], [docs]);
  const types = useMemo(() => [...new Set(docs.map((d) => d.docType))], [docs]);

  const q = search.trim().toLowerCase();
  const shown = docs.filter(
    (d) =>
      (company === "all" || d.companyId === company) &&
      (type === "all" || d.docType === type) &&
      (status === "all" || d.urgency === status) &&
      (!q || [d.title, d.referenceNumber, d.notes].some((x) => x?.toLowerCase().includes(q))),
  );
  const filtering = search !== "" || company !== "all" || type !== "all" || status !== "all";

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4">
        <div className="min-w-[200px] flex-1">
          <label className={labelClass}>Search</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, reference or notes"
            className={`${inputClass} mt-1`}
          />
        </div>
        {companies.length > 1 && (
          <div className="w-full sm:w-[190px]">
            <label className={labelClass}>Company</label>
            <Select value={company} onChange={(e) => setCompany(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="all">All companies</option>
              {companies.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-full sm:w-[230px]">
          <label className={labelClass}>Type</label>
          <Select value={type} onChange={(e) => setType(e.target.value)} className={`${inputClass} mt-1`}>
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{COMPANY_DOC_TYPE_LABEL[t] ?? t}</option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-[170px]">
          <label className={labelClass}>Status</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} mt-1`}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>
        {filtering && (
          <button
            type="button"
            onClick={() => { setSearch(""); setCompany("all"); setType("all"); setStatus("all"); }}
            className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text hover:bg-surface-alt"
          >
            Clear filters
          </button>
        )}
        <button
          type="button"
          disabled={shown.length === 0}
          onClick={async () =>
            (await import("@/lib/export/tableExport")).downloadTableExcel({
              title: "Licences and Documents",
              columns: ["Document", "Type", "Company", "Reference", "Issued", "Expires", "Status", "Notes"],
              rows: shown.map((d) => [d.title, COMPANY_DOC_TYPE_LABEL[d.docType] ?? d.docType, d.companyName, d.referenceNumber ?? "", d.issuedDate ?? "", d.expiryDate ?? "No expiry", STATUS_LABEL[d.urgency] ?? d.urgency, d.notes ?? ""]),
            })
          }
          className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50"
        >
          Export Excel
        </button>
        <button
          type="button"
          disabled={shown.length === 0}
          onClick={async () => {
            // the window is opened by the click itself so that a pop-up blocker lets it through
            const target = window.open("", "_blank");
            const note = [
              company !== "all" ? companies.find(([id]) => id === company)?.[1] : null,
              type !== "all" ? COMPANY_DOC_TYPE_LABEL[type] ?? type : null,
              status !== "all" ? STATUS_LABEL[status] : null,
              q ? `search: ${search.trim()}` : null,
            ].filter(Boolean).join(" | ");
            (await import("@/lib/hr/licenceSummaryPdf")).printRegisterPdf(shown, note, target);
          }}
          className="h-9 rounded-lg bg-primary px-3 text-[13px] font-bold text-white disabled:opacity-50"
        >
          Print
        </button>
      </div>
      {filtering && (
        <div className="border-b border-border px-5 py-2 text-[12.5px] text-text-secondary">
          {`Showing ${shown.length} of ${docs.length}`}
        </div>
      )}
      {shown.length === 0 ? (
        <EmptyRow text="No document matches these filters." />
      ) : (
        <div>
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1.1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
            <div>Document</div>
            <div>Type</div>
            <div>Company</div>
            <div>Reference</div>
            <div>Expires</div>
            <div></div>
          </div>
          {shown.map((d) => (
            <CompanyDocumentRow key={d.id} doc={d} />
          ))}
        </div>
      )}
    </div>
  );
}
