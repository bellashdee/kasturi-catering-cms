import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMalaysiaDate } from "@/lib/format";
import { STATUS_LABEL, statusTone, type RequestStatus } from "@/lib/kitchenPurchase/shared";
import type { RequestRow } from "@/lib/kitchenPurchase/queries";

/** Purchase requests as tap-able rows: number, event, date, items and status. */
export function RequestList({ rows, hrefBase, query, empty }: { rows: (RequestRow & { itemCount: number })[]; hrefBase: string; query: string; empty: string }) {
  if (rows.length === 0) return <p className="rounded-xl border border-border bg-surface px-5 py-6 text-[14px] text-text-secondary">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`${hrefBase}/${r.id}${query}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3.5 hover:border-primary">
            <span className="min-w-0">
              <span className="block text-[11.5px] font-bold tracking-wide text-text-muted">{r.request_no}</span>
              <span className="block text-[15.5px] font-bold text-text">{r.event_name}</span>
              <span className="block text-[13px] text-text-secondary">
                {r.event_date ? formatMalaysiaDate(r.event_date) : "—"} · {r.itemCount} item{r.itemCount === 1 ? "" : "s"}
                {r.companies?.name ? ` · ${r.companies.name}` : ""}
              </span>
            </span>
            <StatusBadge tone={statusTone(r.status)}>{STATUS_LABEL[r.status as RequestStatus] ?? r.status}</StatusBadge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
