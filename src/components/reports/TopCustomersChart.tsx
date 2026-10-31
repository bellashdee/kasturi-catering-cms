import { formatCurrency } from "@/lib/format";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";

export type TopCustomer = { name: string; events: number; revenue: number };

/** The customers who came back most often: a bar for each, as long as its number of events, with the revenue they brought. */
export function TopCustomersChart({ title, customers }: { title: string; customers: TopCustomer[] }) {
  const max = Math.max(...customers.map((c) => c.events), 1);
  return (
    <SectionCard title={title}>
      {customers.length === 0 ? (
        <EmptyRow text="No events with a customer in this period." />
      ) : (
        <ul className="flex flex-col gap-3">
          {customers.map((c, i) => (
            <li key={c.name}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 break-words font-semibold text-text">
                  <span className="mr-2 text-text-secondary">{i + 1}.</span>{c.name}
                  {c.events > 1 && <span className="ml-2 rounded-full bg-info-bg px-2 py-0.5 text-[10.5px] font-bold uppercase text-text-secondary">repeat</span>}
                </span>
                <span className="shrink-0 tabular-nums text-text"><b>{c.events}</b> event{c.events === 1 ? "" : "s"} · {formatCurrency(c.revenue)}</span>
              </div>
              <div className="mt-1 h-2.5 rounded-full [print-color-adjust:exact]" style={{ background: "var(--color-info-bg)" }}>
                <div className="h-2.5 rounded-full [print-color-adjust:exact]" style={{ width: `${Math.max((c.events / max) * 100, 3)}%`, background: "var(--color-navy-700)" }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
