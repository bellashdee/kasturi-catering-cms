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
const R = 46;
const LABEL_R = 56;
const NAME_MAX = 22;
const CHAR_W = 4.3; // width of one character of the name (name font size 7.6)
const LINE_H = 18; // percentage line + name line

const shorten = (name: string) => (name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1).trimEnd()}…` : name);

type Placed = { x1: number; x2: number; y1: number; y2: number };

/** Where the label of a slice goes (outside the pie) and the box it takes, so labels can be kept from covering each other. */
function labelBox(mid: number, name: string, percentText: string) {
  const sin = Math.sin(mid);
  const cos = Math.cos(mid);
  const x = CX + LABEL_R * sin;
  const y = CY - LABEL_R * cos;
  const anchor: "start" | "end" | "middle" = sin > 0.25 ? "start" : sin < -0.25 ? "end" : "middle";
  const width = Math.max(shorten(name).length * CHAR_W, percentText.length * 5.4);
  const tx = x + (anchor === "start" ? 2 : anchor === "end" ? -2 : 0);
  // centre of the two lines: level with the tick on the sides, above / below it at the top and bottom of the pie
  const cy = cos > 0.7 ? y - LINE_H / 2 - 1 : cos < -0.7 ? y + LINE_H / 2 + 1 : y;
  const x1 = anchor === "start" ? tx : anchor === "end" ? tx - width : tx - width / 2;
  const box: Placed = { x1, x2: x1 + width, y1: cy - LINE_H / 2, y2: cy + LINE_H / 2 };
  return { sin, cos, anchor, tx, cy, box };
}

const overlaps = (a: Placed, b: Placed) => a.x1 < b.x2 + 1 && b.x1 < a.x2 + 1 && a.y1 < b.y2 + 1 && b.y1 < a.y2 + 1;

/** The percentage and the name of the slice, written outside the pie next to it with a short tick in the slice colour. */
function SliceLabel({ mid, name, percentText, colour }: { mid: number; name: string; percentText: string; colour: string }) {
  const { sin, cos, anchor, tx, cy } = labelBox(mid, name, percentText);
  return (
    <>
      <line x1={CX + (R - 2) * sin} y1={CY - (R - 2) * cos} x2={CX + (LABEL_R - 3) * sin} y2={CY - (LABEL_R - 3) * cos} style={{ stroke: colour }} strokeWidth="1.4" strokeLinecap="round" />
      <text x={tx} y={cy - 4} textAnchor={anchor} dominantBaseline="central" fontSize="9.5" fontWeight="700" style={{ fill: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>
        {percentText}
      </text>
      <text x={tx} y={cy + 5.5} textAnchor={anchor} dominantBaseline="central" fontSize="7.6" fontWeight="500" style={{ fill: "var(--color-text-secondary)" }}>
        {shorten(name)}
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
          <svg viewBox="-80 -20 280 160" role="img" aria-label={`${title}: ${shown.map((s) => `${s.label} ${((s.value / total) * 100).toFixed(0)}%`).join(", ")}`} className="w-full max-w-[460px] shrink-0">
            {shown.length === 1 ? (
              <>
                <circle cx={CX} cy={CY} r={R} style={{ fill: COLOURS[0] }} />
                <text x={CX} y={CY - R - 14} textAnchor="middle" dominantBaseline="central" fontSize="9.5" fontWeight="700" style={{ fill: "var(--color-text)" }}>
                  100%
                </text>
                <text x={CX} y={CY - R - 5} textAnchor="middle" dominantBaseline="central" fontSize="7.6" fontWeight="500" style={{ fill: "var(--color-text-secondary)" }}>
                  {shorten(shown[0].label)}
                </text>
              </>
            ) : (
              (() => {
                let angle = 0;
                const placed: Placed[] = [];
                return shown.map((s, i) => {
                  const start = angle;
                  const sweep = (s.value / total) * Math.PI * 2;
                  angle += sweep;
                  const mid = start + sweep / 2;
                  const percent = (s.value / total) * 100;
                  const percentText = `${percent.toFixed(percent >= 10 ? 0 : 1)}%`;
                  // a label that would cover another one is left out (the list under the chart has every slice with its value)
                  const { box } = labelBox(mid, s.label, percentText);
                  const clear = percent >= 2 && placed.every((q) => !overlaps(q, box));
                  if (clear) placed.push(box);
                  return (
                    <g key={s.label}>
                      <path d={arc(CX, CY, R, start, angle)} style={{ fill: COLOURS[i % COLOURS.length] }} stroke="#ffffff" strokeWidth="1.5" />
                      {clear && <SliceLabel mid={mid} name={s.label} percentText={percentText} colour={COLOURS[i % COLOURS.length]} />}
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
