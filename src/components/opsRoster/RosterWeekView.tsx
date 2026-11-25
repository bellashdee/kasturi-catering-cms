import Link from "next/link";
import { addDays, entryHours, hasOt, hoursText, OT_CHIP, STATUS, shortDay, slotsLine, taskLine, type DayRoster, type RosterStaff } from "@/lib/opsRoster/shared";

/** The week (Monday to Sunday) as a table: one row per staff member, one column per day, the status, hours and tasks in each box. */
export function RosterWeekView({ start, days, staff, dayHref }: { start: string; days: Map<string, DayRoster>; staff: RosterStaff[]; dayHref: (date: string) => string }) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const onWeek = staff.filter((s) => s.active || dates.some((d) => days.get(d)?.entries.some((e) => e.staffId === s.id)));
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
      <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-surface-alt text-[11px] font-bold uppercase text-text-muted">
            <th className="sticky left-0 z-10 w-24 bg-surface-alt px-3 py-2.5 text-left">Staff</th>
            {dates.map((d) => (
              <th key={d} className="border-l border-border px-2 py-2.5 text-left">
                <Link href={dayHref(d)} className="hover:text-primary hover:underline">{shortDay(d)}</Link>
                {!days.has(d) && <div className="text-[10px] font-semibold normal-case text-text-muted">no roster</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {onWeek.map((s) => (
            <tr key={s.id} className="border-t border-border align-top">
              <td className="sticky left-0 z-10 bg-surface px-3 py-2 text-[13.5px] font-extrabold text-text">{s.shortName}</td>
              {dates.map((d) => {
                const e = days.get(d)?.entries.find((x) => x.staffId === s.id);
                if (!e) return <td key={d} className="border-l border-border px-2 py-2 text-text-muted">—</td>;
                const { worked, ot } = entryHours(e);
                return (
                  <td key={d} className="border-l border-border px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${STATUS[e.status].chip}`}>{STATUS[e.status].label}</span>
                      {hasOt(e) && <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${OT_CHIP}`}>OT</span>}
                    </div>
                    {e.status === "on_duty" && (
                      <>
                        <div className="mt-1 font-semibold leading-snug text-text">{slotsLine(e).replace(/ \+ OT$/, "")}</div>
                        {worked > 0 && <div className="text-[11px] text-text-muted">{hoursText(worked)}{ot ? ` · OT ${hoursText(ot)}` : ""}</div>}
                        {e.tasks.length > 0 && (
                          <ul className="mt-1 text-[11.5px] leading-snug text-text-secondary">
                            {e.tasks.map((t, i) => <li key={i}>• {taskLine(t)}</li>)}
                          </ul>
                        )}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
