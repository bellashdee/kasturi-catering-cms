"use client";

import { COMPANY_DOC_TYPE_LABEL } from "@/lib/hr/constants";
import { CompanyDocumentRow, type CompanyDocData } from "@/components/hr/CompanyDocumentRow";
import { EmptyRow } from "@/components/dashboard/SectionCard";

const STATUS_LABEL: Record<string, string> = {
  valid: "Valid",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  no_expiry: "No expiry",
};

/**
 * The Licences & Documents table with its Export Excel and Print buttons. The rows come filtered and sorted from the page (its filter bar);
 * `total` is the number before the filters and `filterNote` describes the filters for the printed register.
 */
export function CompanyDocumentList({ docs, total, filterNote }: { docs: CompanyDocData[]; total: number; filterNote: string }) {
  const filtering = docs.length !== total;

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="text-[12.5px] text-text-secondary">{filtering ? `Showing ${docs.length} of ${total}` : ""}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={docs.length === 0}
            onClick={async () =>
              (await import("@/lib/export/tableExport")).downloadTableExcel({
                title: "Licences and Documents",
                columns: ["Document", "Type", "Company", "Reference", "Issued", "Expires", "Status", "Notes"],
                rows: docs.map((d) => [d.title, COMPANY_DOC_TYPE_LABEL[d.docType] ?? d.docType, d.companyName, d.referenceNumber ?? "", d.issuedDate ?? "", d.expiryDate ?? "No expiry", STATUS_LABEL[d.urgency] ?? d.urgency, d.notes ?? ""]),
              })
            }
            className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50"
          >
            Export Excel
          </button>
          <button
            type="button"
            disabled={docs.length === 0}
            onClick={async () => {
              // the window is opened by the click itself so that a pop-up blocker lets it through
              const target = window.open("", "_blank");
              (await import("@/lib/hr/licenceSummaryPdf")).printRegisterPdf(docs, filterNote, target);
            }}
            className="h-9 rounded-lg bg-primary px-3 text-[13px] font-bold text-white disabled:opacity-50"
          >
            Print
          </button>
        </div>
      </div>
      {docs.length === 0 ? (
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
          {docs.map((d) => (
            <CompanyDocumentRow key={d.id} doc={d} />
          ))}
        </div>
      )}
    </div>
  );
}
