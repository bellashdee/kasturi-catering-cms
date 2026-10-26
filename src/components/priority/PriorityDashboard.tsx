import type { ReactNode } from "react";
import { Pill } from "@/components/priority/ui";
import type { Cheer } from "@/lib/priority/cheer";
import { BriefingTaskCheck } from "@/components/priority/ReminderPanels";

/**
 * The top of the Priority Centre in a soft, colourful dashboard style: a greeting, figure tiles in pastel colours, the week's
 * finished tasks, a month calendar with the due dates, progress by department, the top tasks, the next reminders and a cheer.
 * Every figure comes from the records the page already loaded; nothing is invented.
 */

export type Tint = "lavender" | "pink" | "green" | "yellow" | "peach" | "sky";

const TINT: Record<Tint, { bg: string; edge: string; ink: string }> = {
  lavender: { bg: "#ece6fa", edge: "#d9cdf5", ink: "#6a4bb8" },
  pink: { bg: "#fde3e6", edge: "#f7c9cf", ink: "#c0485c" },
  green: { bg: "#e2f2e5", edge: "#c6e3cb", ink: "#3c7a4a" },
  yellow: { bg: "#fdf0d3", edge: "#f6dfa6", ink: "#9a6a0a" },
  peach: { bg: "#fde6d6", edge: "#f7cfb3", ink: "#b0582b" },
  sky: { bg: "#e1eefb", edge: "#c3dcf5", ink: "#2f6aa8" },
};

const CARD = "rounded-3xl border border-border bg-surface p-5";

export function DashGreeting({ name, hour }: { name: string; hour: number }) {
  const text = hour < 12 ? `Good morning, ${name}! 🌤️` : hour < 18 ? `Good afternoon, ${name}! ☀️` : `Good evening, ${name}! 🌙`;
  return (
    <div>
      <h1 className="soft-serif text-[30px] font-bold leading-tight text-text">{text}</h1>
      <p className="mt-1 text-[15px] text-text-secondary">Let&apos;s make today productive and amazing!</p>
    </div>
  );
}

export function StatTile({ icon, label, value, sub, tint }: { icon: string; label: string; value: ReactNode; sub?: ReactNode; tint: Tint }) {
  const t = TINT[tint];
  return (
    <div className="flex min-w-0 items-center gap-3.5 rounded-3xl border p-4" style={{ background: t.bg, borderColor: t.edge }}>
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/75 text-[26px] shadow-sm" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold leading-snug text-text-secondary">{label}</div>
        <div className="mt-0.5 break-words text-[26px] font-extrabold leading-tight tabular-nums text-text">{value}</div>
        {sub && <div className="text-[12px] font-semibold leading-snug" style={{ color: t.ink }}>{sub}</div>}
      </div>
    </div>
  );
}

/** A smooth-looking line and area of one figure over seven days. */
export function WeekChart({ title, days }: { title: string; days: { label: string; value: number }[] }) {
  const W = 560;
  const H = 210;
  const left = 34;
  const right = 14;
  const top = 16;
  const bottom = 30;
  const max = Math.max(4, ...days.map((d) => d.value));
  const step = Math.ceil(max / 4);
  const ceil = step * 4;
  const x = (i: number) => left + (i * (W - left - right)) / Math.max(days.length - 1, 1);
  const y = (v: number) => top + (1 - v / ceil) * (H - top - bottom);
  const pts = days.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`);
  const line = `M ${pts.join(" L ")}`;
  const area = `${line} L ${x(days.length - 1).toFixed(1)},${y(0).toFixed(1)} L ${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const total = days.reduce((t, d) => t + d.value, 0);
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[16px] font-bold text-text">{title}</div>
        <span className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: TINT.lavender.bg, color: TINT.lavender.ink }}>{`Last 7 days: ${total}`}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`${title}: ${days.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
        <defs>
          <linearGradient id="weekArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b6fd6" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#8b6fd6" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((g) => {
          const v = g * step;
          return (
            <g key={g}>
              <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} stroke="#e8dcd9" strokeWidth="1" />
              <text x={left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#6b6370">{v}</text>
            </g>
          );
        })}
        <path d={area} fill="url(#weekArea)" />
        <path d={line} fill="none" stroke="#7c5cc4" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        {days.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.value)} r="4.6" fill="#ffffff" stroke="#7c5cc4" strokeWidth="2.4">
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
            <text x={x(i)} y={H - 9} textAnchor="middle" fontSize="11.5" fill="#4b4452" fontWeight="600">{d.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The month with today circled; a pink dot is a task due that day, a lavender dot a supplier payment due. */
export function MonthCalendar({ title, year, month, todayDay, marks }: { title: string; year: number; month: number; todayDay: number; marks: Record<number, { tasks: number; payments: number }> }) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday
  const offset = (first + 6) % 7; // Monday first
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array.from({ length: offset }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <div className={CARD}>
      <div className="text-center text-[16px] font-bold text-text">{title}</div>
      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-[12px]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 font-bold text-text">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const mark = marks[d];
          const isToday = d === todayDay;
          return (
            <div key={i} className="flex flex-col items-center py-0.5">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] ${isToday ? "bg-[#7c5cc4] font-extrabold text-white" : "text-text-secondary"}`}>{d}</span>
              <span className="flex h-1.5 gap-0.5">
                {mark?.tasks ? <span className="h-1.5 w-1.5 rounded-full bg-[#e0607a]" title={`${mark.tasks}`} /> : null}
                {mark?.payments ? <span className="h-1.5 w-1.5 rounded-full bg-[#8b6fd6]" title={`${mark.payments}`} /> : null}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-4 text-[12px] text-text-secondary">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#e0607a]" />Task due</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#8b6fd6]" />Payment due</span>
      </div>
    </div>
  );
}

const BAR: string[] = ["#8b6fd6", "#e88a9a", "#6fbf84", "#eab94f"];

export function ProgressList({ title, rows, empty }: { title: string; rows: { name: string; done: number; total: number }[]; empty: string }) {
  return (
    <div className={CARD}>
      <div className="text-[16px] font-bold text-text">{title}</div>
      {rows.length === 0 ? (
        <p className="mt-4 text-[14px] text-text-secondary">{empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {rows.map((r, i) => {
            const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
            return (
              <li key={r.name}>
                <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="min-w-0 truncate font-semibold text-text">{r.name}</span>
                  <span className="shrink-0 font-bold tabular-nums text-text-secondary">{`${r.done}/${r.total} · ${pct}%`}</span>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full bg-[#efe6e3]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={r.name}>
                  <div className="h-2.5 rounded-full" style={{ width: `${Math.max(pct, r.done > 0 ? 3 : 0)}%`, background: BAR[i % BAR.length] }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export type TopTask = { id: string; title: string; priority: "urgent" | "high" | "medium" | "low"; priorityLabel: string; dueLabel: string; canComplete: boolean };

export function TopTasks({ title, tasks, empty }: { title: string; tasks: TopTask[]; empty: string }) {
  const TONE = { urgent: "danger", high: "warning", medium: "info", low: "neutral" } as const;
  return (
    <div className={CARD}>
      <div className="text-[16px] font-bold text-text">{title}</div>
      {tasks.length === 0 ? (
        <p className="mt-4 text-[14px] text-text-secondary">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-text">{t.title}</div>
                <div className="text-[12px] text-text-secondary">{t.dueLabel}</div>
              </div>
              <div className="flex items-center gap-2.5">
                <Pill tone={TONE[t.priority]}>{t.priorityLabel}</Pill>
                {t.canComplete && <BriefingTaskCheck id={t.id} title={t.title} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type ReminderRow = { key: string; icon: string; title: string; when: string; amount?: string };

export function UpcomingReminders({ title, rows, empty }: { title: string; rows: ReminderRow[]; empty: string }) {
  const t = TINT.pink;
  return (
    <div className="rounded-3xl border p-5" style={{ background: t.bg, borderColor: t.edge }}>
      <div className="text-[16px] font-bold text-text">{title}</div>
      {rows.length === 0 ? (
        <p className="mt-3 text-[14px] text-text-secondary">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-[16px]" aria-hidden="true">{r.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-text">{r.title}</div>
                <div className="text-[12.5px] text-text-secondary">{r.when}</div>
              </div>
              {r.amount && <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-text">{r.amount}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The words of encouragement of the day: a saying of a well-known person, or a line for the star sign of the person's birthday (new every day). */
export function CheerCard({ cheer }: { cheer: Cheer }) {
  const t = TINT.lavender;
  return (
    <div className="flex items-center justify-between gap-3 rounded-3xl border p-5" style={{ background: t.bg, borderColor: t.edge }}>
      <div className="min-w-0">
        {cheer.kind === "quote" ? (
          <>
            <div className="soft-serif text-[17px] font-bold leading-snug" style={{ color: t.ink }}>{`“${cheer.text}”`}</div>
            <p className="mt-1.5 text-right text-[13px] font-semibold text-text-secondary">{`— ${cheer.by}`}</p>
          </>
        ) : (
          <>
            <div className="soft-serif text-[17px] font-bold leading-snug" style={{ color: t.ink }}>{`${cheer.symbol} ${cheer.sign}`}</div>
            <p className="mt-1 text-[13.5px] leading-snug text-text-secondary">{cheer.text}</p>
          </>
        )}
      </div>
      <span className="text-[44px] leading-none" aria-hidden="true">{cheer.icon}</span>
    </div>
  );
}
