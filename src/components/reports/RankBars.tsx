import { formatCurrency } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";

export type RankItem = { label: string; value: number; note?: string; flag?: string };

/** A ranking as bars: each as long as its share of the biggest, with its amount, its share of the total and an optional note / flag. */
export function RankBars({ items, total, color = "var(--color-navy-700)", empty }: { items: RankItem[]; total?: number; color?: string; empty: string }) {
  if (items.length === 0) return <EmptyRow text={empty} />;
  const max = Math.max(...items.map((i) => i.value), 1);
  const all = total ?? items.reduce((t, i) => t + i.value, 0);
  return (
    <ul className="flex flex-col gap-3">
      {items.map((i, n) => (
        <li key={`${i.label}-${n}`}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 break-words font-semibold text-text">
              <span className="mr-2 text-text-secondary">{n + 1}.</span>{i.label}
              {i.note && <span className="font-normal text-text-secondary"> · {i.note}</span>}
              {i.flag && <span className="ml-2 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase" style={{ background: "var(--color-danger-bg, #fde8e8)", color: "var(--color-danger, #b42318)" }}>{i.flag}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-text"><b>{formatCurrency(i.value)}</b>{all > 0 && <span className="ml-1.5 text-text-secondary">{((i.value / all) * 100).toFixed(1)}%</span>}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full [print-color-adjust:exact]" style={{ background: "var(--color-info-bg)" }}>
            <div className="h-2.5 rounded-full [print-color-adjust:exact]" style={{ width: `${Math.max((i.value / max) * 100, 2)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
