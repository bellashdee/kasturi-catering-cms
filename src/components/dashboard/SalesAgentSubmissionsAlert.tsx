import Link from "next/link";
import type { PendingSubmission } from "@/lib/catering/pending";
import { formatMalaysiaDateTime } from "@/lib/format";

/** The "new from sales agents" notice at the top of the main dashboard: how many are waiting, the latest ones, and where to approve them. */
export function SalesAgentSubmissionsAlert({
  customerCount,
  quotationCount,
  items,
  companyQuery,
}: {
  customerCount: number;
  quotationCount: number;
  items: PendingSubmission[];
  companyQuery: string;
}) {
  const total = customerCount + quotationCount;
  if (total === 0) return null;

  return (
    <div className="rounded-xl border border-primary/40 bg-info-bg p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-extrabold text-text">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-danger px-1.5 text-[12px] font-bold text-white">{total}</span>
            New from sales agents — waiting for your review
          </div>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">Nothing is saved to the system until you approve it.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quotationCount > 0 && (
            <Link href={`/catering/quotation-requests${companyQuery}`} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white">
              Review quotation requests ({quotationCount})
            </Link>
          )}
          {customerCount > 0 && (
            <Link href={`/catering/customers/submissions${companyQuery}`} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white">
              Review customer details ({customerCount})
            </Link>
          )}
        </div>
      </div>

      <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
        {items.map((i) => (
          <Link
            key={`${i.kind}-${i.id}`}
            href={`${i.kind === "quotation" ? "/catering/quotation-requests" : "/catering/customers/submissions"}${companyQuery}`}
            className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-surface-alt"
          >
            <div className="min-w-0">
              <div className="truncate font-semibold text-text">{i.title}</div>
              <div className="truncate text-xs text-text-muted">{i.detail} · from {i.agent}</div>
            </div>
            <div className="shrink-0 text-xs text-text-muted">{formatMalaysiaDateTime(i.createdAt)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
