import { formatCurrency } from "@/lib/format";

export type PieSlice = { label: string; value: number };

/** Restrained, clearly different colours; the legend always names every slice, so colour is never the only clue. */
const COLOURS = ["#1f4e79", "#2a9d8f", "#d4a017", "#c4622d", "#7b4b94", "#7a8b4a", "#4a90c2", "#c0527a", "#8b6b4a", "#64748b"];
const MAX_SLICES = 8;

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const x1 = cx + r * Math.sin(from);
  const y1 = cy - r * Math.cos(from);
  const x2 = cx + r * Math.sin(to);
  const y2 = cy - r * Math.cos(to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

/**
 * A pie chart of how a total is shared (e.g. cost by category): the biggest slices are shown, the rest are combined as
 * "Others". Drawn as plain SVG with a full legend (name, amount and percentage), so it also reads without colour.
 */
export function PieChart({ title, slices, format = formatCurrency }: { title: string; slices: PieSlice[]; format?: (n: number) => string }) {
  const positive = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const shown = positive.slice(0, MAX_SLICES);
  const rest = positive.slice(MAX_SLICES).reduce((t, s) => t + s.value, 0);
  if (rest > 0) shown.push({ label: "Others", value: rest });
  const total = shown.reduce((t, s) => t + s.value, 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="text-[15px] font-bold text-text">{title}</div>
      {total <= 0 ? (
        <div className="py-8 text-center text-[14px] text-text-secondary">No figures to show for this period.</div>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-4">
          <svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label={`${title}: ${shown.map((s) => `${s.label} ${((s.value / total) * 100).toFixed(0)}%`).join(", ")}`} className="shrink-0">
            {shown.length === 1 ? (
              <circle cx="60" cy="60" r="56" fill={COLOURS[0]} />
            ) : (
              (() => {
                let angle = 0;
                return shown.map((s, i) => {
                  const start = angle;
                  angle += (s.value / total) * Math.PI * 2;
                  return <path key={s.label} d={arc(60, 60, 56, start, angle)} fill={COLOURS[i % COLOURS.length]} stroke="#ffffff" strokeWidth="1.5" />;
                });
              })()
            )}
          </svg>
          <ul className="w-full min-w-0 flex-1 text-[14px]">
            {shown.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2.5 border-b border-border py-1.5 last:border-b-0">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: COLOURS[i % COLOURS.length] }} aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words font-medium text-text">{s.label}</span>
                <span className="shrink-0 tabular-nums text-text-secondary">{format(s.value)}</span>
                <span className="w-12 shrink-0 text-right font-bold tabular-nums text-text">{((s.value / total) * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Adds up amounts by a label (e.g. cost by category). */
export function sumBy<T>(rows: T[], label: (row: T) => string, amount: (row: T) => number): PieSlice[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(label(r), (map.get(label(r)) ?? 0) + amount(r));
  return Array.from(map, ([l, value]) => ({ label: l, value }));
}
