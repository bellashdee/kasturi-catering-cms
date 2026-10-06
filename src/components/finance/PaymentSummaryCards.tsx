import { formatRM, type PaymentSummary } from "@/lib/finance/payments";

/** Total to pay / paid / pending / overdue for a set of payments. */
export function PaymentSummaryCards({ summary }: { summary: PaymentSummary }) {
  const cards: { label: string; value: number; tone: string }[] = [
    { label: "Total to Pay", value: summary.total, tone: "text-text" },
    { label: "Total Paid", value: summary.paid, tone: "text-success" },
    { label: "Total Pending", value: summary.pending, tone: "text-warning" },
    { label: "Total Overdue", value: summary.overdue, tone: summary.overdue > 0 ? "text-danger" : "text-text" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{c.label}</div>
          <div className={`mt-1 text-xl font-extrabold ${c.tone}`}>{formatRM(c.value)}</div>
        </div>
      ))}
    </div>
  );
}
