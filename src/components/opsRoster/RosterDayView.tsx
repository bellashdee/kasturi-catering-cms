import { entryHours, hasOt, hoursText, OT_CHIP, STATUS, slotsLine, taskLine, type DayRoster, type RosterStaff } from "@/lib/opsRoster/shared";

/**
 * The roster of one day as staff read it: one card per staff member (name, status colour, working hours, OT, tasks), then the
 * remarks. Lines changed in the latest update are marked "Updated". `highlightStaffId` puts a staff member's own card first.
 */
export function RosterDayView({ day, staff, highlightStaffId }: { day: DayRoster; staff: RosterStaff[]; highlightStaffId?: string | null }) {
  const byId = new Map(staff.map((s) => [s.id, s]));
  const entries = [...day.entries].sort((a, b) => Number(b.staffId === highlightStaffId) - Number(a.staffId === highlightStaffId));
  const latest = day.updatedAt;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((e) => {
          const s = byId.get(e.staffId);
          const st = STATUS[e.status];
          const { worked, ot } = entryHours(e);
          const updated = day.version > 1 && !!latest && e.changedAt === latest;
          const mine = e.staffId === highlightStaffId;
          return (
            <div key={e.staffId} className={`rounded-xl border bg-surface p-4 shadow-sm ${mine ? "border-primary ring-1 ring-primary" : updated ? "border-sky-400" : "border-border"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />
                <span className="text-[17px] font-extrabold tracking-wide text-text">{s?.shortName ?? "—"}</span>
                {mine && <span className="text-[11px] font-bold text-primary">(you)</span>}
                <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-bold ${st.chip}`}>{st.label}</span>
                {hasOt(e) && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${OT_CHIP}`}>OT</span>}
                {updated && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10.5px] font-bold text-white">Updated</span>}
              </div>
              {e.status === "on_duty" ? (
                <>
                  <div className="mt-2 text-[14.5px] font-semibold text-text">{slotsLine(e) || <span className="font-normal text-text-muted">No working hours yet</span>}</div>
                  {worked > 0 && (
                    <div className="text-[12px] text-text-secondary">
                      {hoursText(worked)} working{ot > 0 ? ` · OT ${hoursText(ot)}` : ""}
                    </div>
                  )}
                  {e.tasks.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 text-[14px] text-text">
                      {e.tasks.map((t, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-text-muted">•</span>
                          <span>{taskLine(t)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <div className="mt-2 text-[14.5px] font-semibold text-text-secondary">• {st.label}</div>
              )}
              {e.note && <div className="mt-2 rounded-lg bg-surface-alt px-2.5 py-1.5 text-[12.5px] text-text-secondary">{e.note}</div>}
            </div>
          );
        })}
      </div>
      {day.remarks && (
        <div className="rounded-xl border border-warning/40 bg-warning-bg px-4 py-3">
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-warning">Remarks</div>
          <div className="mt-0.5 whitespace-pre-line text-[14px] text-text">{day.remarks}</div>
        </div>
      )}
    </div>
  );
}
