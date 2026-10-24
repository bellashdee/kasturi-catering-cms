import { formatCurrency } from "@/lib/format";

export type PieSlice = { label: string; value: number };

/** Restrained, clearly different colours; the legend always names every slice, so colour is never the only clue. */
const COLOURS = Array.from({ length: 10 }, (_, i) => `var(--chart-${i + 1})`);
const MAX_SLICES = 8;

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const x1 = cx + r * Math.sin(from);
  const y1 = cy - r * Math.cos(from);
  const x2 = cx + r * Math.sin(to);
  const y2 = cy - r * Math.cos(to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

const CX = 60;
const CY = 60;
const R = 50;
const LABEL_R = 60;

/** The percentage written outside the slice it belongs to, with a short tick in the slice colour (the full list is under the chart). */
function PercentLabel({ mid, percent, colour }: { mid: number; percent: number; colour: string }) {
  const sin = Math.sin(mid);
  const cos = Math.cos(mid);
  const x = CX + LABEL_R * sin;
  const y = CY - LABEL_R * cos;
  const anchor = sin > 0.25 ? "start" : sin < -0.25 ? "end" : "middle";
  // the text sits a little further out horizontally, and above / below the tick at the top and bottom of the pie
  const tx = x + (anchor === "start" ? 1.5 : anchor === "end" ? -1.5 : 0);
  const ty = y + (cos > 0.7 ? -3 : cos < -0.7 ? 4 : 0);
  return (
    <>
      <line x1={CX + (R - 2) * sin} y1={CY - (R - 2) * cos} x2={CX + (LABEL_R - 3) * sin} y2={CY - (LABEL_R - 3) * cos} style={{ stroke: colour }} strokeWidth="1.4" strokeLinecap="round" />
      <text x={tx} y={ty} textAnchor={anchor} dominantBaseline="central" fontSize="9.5" fontWeight="700" style={{ fill: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>
        {percent.toFixed(percent >= 10 ? 0 : 1)}%
      </text>
    </>
  );
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
          <svg viewBox="-36 -14 192 148" role="img" aria-label={`${title}: ${shown.map((s) => `${s.label} ${((s.value / total) * 100).toFixed(0)}%`).join(", ")}`} className="w-full max-w-[300px] shrink-0">
            {shown.length === 1 ? (
              <>
                <circle cx={CX} cy={CY} r={R} style={{ fill: COLOURS[0] }} />
                <text x={CX} y={CY - R - 6} textAnchor="middle" dominantBaseline="central" fontSize="9.5" fontWeight="700" style={{ fill: "var(--color-text)" }}>
                  100%
                </text>
              </>
            ) : (
              (() => {
                let angle = 0;
                const placed: { x: number; y: number }[] = [];
                return shown.map((s, i) => {
                  const start = angle;
                  const sweep = (s.value / total) * Math.PI * 2;
                  angle += sweep;
                  const mid = start + sweep / 2;
                  const percent = (s.value / total) * 100;
                  // a label that would sit on top of the one before it is left out (the list under the chart has every value)
                  const px = CX + LABEL_R * Math.sin(mid);
                  const py = CY - LABEL_R * Math.cos(mid);
                  const clear = percent >= 2 && placed.every((q) => Math.hypot(q.x - px, q.y - py) > 11);
                  if (clear) placed.push({ x: px, y: py });
                  return (
                    <g key={s.label}>
                      <path d={arc(CX, CY, R, start, angle)} style={{ fill: COLOURS[i % COLOURS.length] }} stroke="#ffffff" strokeWidth="1.5" />
                      {clear && <PercentLabel mid={mid} percent={percent} colour={COLOURS[i % COLOURS.length]} />}
                    </g>
                  );
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
