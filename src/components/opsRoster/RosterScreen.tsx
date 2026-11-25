import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { formatMalaysiaDateTime } from "@/lib/format";
import { latestRosterBefore, loadRosterChanges, loadRosters, loadRosterStaff } from "@/lib/opsRoster/queries";
import { addDays, dayTitle, entryHours, hoursText, shortDay, slotsLine, STATUS, taskLine, weekStart, type DayRoster, type RosterStaff } from "@/lib/opsRoster/shared";
import { RosterNav, type RosterViewKey } from "@/components/opsRoster/RosterNav";
import { RosterDayView } from "@/components/opsRoster/RosterDayView";
import { RosterDayEditor } from "@/components/opsRoster/RosterDayEditor";
import { RosterWeekView } from "@/components/opsRoster/RosterWeekView";
import { RosterStaffManager } from "@/components/opsRoster/RosterStaffManager";
import { RosterCopyButton } from "@/components/opsRoster/RosterCopyButton";
import { ExportButtons } from "@/components/shared/ExportButtons";
import type { ExportTable } from "@/lib/export/tableExport";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const rosterToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/**
 * The Daily Duty Roster screen, shared by Operation Management (admins edit, others view) and My Profile (staff view their own and
 * the team's roster). `basePath` is the page it is on.
 */
export async function RosterScreen({ basePath, date, view, period, canEdit, myUserId }: { basePath: string; date: string; view: RosterViewKey; period: "week" | "month"; canEdit: boolean; myUserId: string }) {
  const supabase = await createClient();
  const today = rosterToday();
  const staff = await loadRosterStaff(supabase);
  const mine = await myStaffId(supabase, staff, myUserId);
  const views: { key: RosterViewKey; label: string }[] = [
    { key: "day", label: "Daily" },
    { key: "week", label: "Weekly" },
    { key: "ot", label: "OT Summary" },
    { key: "history", label: "Change History" },
    ...(canEdit ? [{ key: "staff" as const, label: "Staff" }] : []),
  ];
  const dayHref = (d: string) => `${basePath}?view=day&date=${d}`;

  let body: React.ReactNode = null;
  if (view === "day") {
    const day = (await loadRosters(supabase, date, date)).get(date) ?? null;
    const header = (
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Jadual Driver & Operation</div>
          <div className="text-[20px] font-extrabold text-text">{dayTitle(date)}</div>
        </div>
        {day?.updatedAt && (
          <div className="rounded-lg bg-sky-50 px-3 py-1.5 text-[12.5px] text-sky-900">
            Last updated <b>{formatMalaysiaDateTime(day.updatedAt)}</b>
            {day.updatedByName ? ` by ${day.updatedByName}` : ""}
            {day.version > 1 ? ` · update ${day.version}` : ""}
          </div>
        )}
      </div>
    );
    if (canEdit) {
      const previous = day ? null : await latestRosterBefore(supabase, date);
      body = (
        <>
          {header}
          <RosterDayEditor key={`${date}-${day?.version ?? 0}`} date={date} day={day} staff={staff} previous={previous} />
        </>
      );
    } else {
      body = (
        <>
          {header}
          {day ? (
            <>
              <div className="flex flex-wrap gap-2">
                <RosterCopyButton day={day} staff={staff} />
              </div>
              <RosterDayView day={day} staff={staff} highlightStaffId={mine} />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-center text-[13.5px] text-text-secondary">The roster for {dayTitle(date)} is not out yet.</div>
          )}
        </>
      );
    }
  } else if (view === "week") {
    const start = weekStart(date);
    const days = await loadRosters(supabase, start, addDays(start, 6));
    const table = weekTable(start, days, staff);
    body = (
      <>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="text-[18px] font-extrabold text-text">
            Week of {shortDay(start)} – {shortDay(addDays(start, 6))} {start.slice(0, 4)}
          </div>
          <ExportButtons table={table} />
        </div>
        <RosterWeekView start={start} days={days} staff={staff} dayHref={dayHref} />
      </>
    );
  } else if (view === "ot") {
    const from = period === "week" ? weekStart(date) : `${date.slice(0, 7)}-01`;
    const to = period === "week" ? addDays(from, 6) : lastDayOfMonth(date);
    const days = await loadRosters(supabase, from, to);
    const rows = staff
      .map((s) => {
        const lines = [...days.values()].flatMap((d) => d.entries.filter((e) => e.staffId === s.id));
        const sum = lines.reduce(
          (acc, e) => {
            const h = entryHours(e);
            acc[e.status] += 1;
            acc.worked += h.worked;
            acc.ot += h.ot;
            if (h.ot > 0) acc.otDays += 1;
            return acc;
          },
          { on_duty: 0, off: 0, leave: 0, mc: 0, worked: 0, ot: 0, otDays: 0 },
        );
        return { s, sum, any: lines.length > 0 };
      })
      .filter((r) => r.any || r.s.active);
    const label = period === "week" ? `Week ${shortDay(from)} – ${shortDay(to)} ${from.slice(0, 4)}` : `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
    const table: ExportTable = {
      title: `Duty Roster OT Summary - ${label}`,
      subtitle: `${days.size} day(s) with a roster. OT is for HR and payroll reference; it is not an OT claim.`,
      columns: ["Staff", "Full name", "On duty (days)", "Off", "Leave", "MC", "Working hours", "OT days", "OT hours"],
      rows: rows.map(({ s, sum }) => [s.shortName, s.fullName, String(sum.on_duty), String(sum.off), String(sum.leave), String(sum.mc), round(sum.worked), String(sum.otDays), round(sum.ot)]),
    };
    body = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-surface-alt p-1 text-[12.5px] font-semibold">
            <a href={`${basePath}?view=ot&period=week&date=${date}`} className={`rounded-md px-3 py-1.5 ${period === "week" ? "bg-surface text-primary shadow-sm" : "text-text-secondary"}`}>Weekly</a>
            <a href={`${basePath}?view=ot&period=month&date=${date}`} className={`rounded-md px-3 py-1.5 ${period === "month" ? "bg-surface text-primary shadow-sm" : "text-text-secondary"}`}>Monthly</a>
          </div>
          <div className="text-[16px] font-extrabold text-text">{label}</div>
          <div className="ml-auto"><ExportButtons table={table} /></div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="bg-surface-alt text-left text-[11px] font-bold uppercase text-text-muted">
                <th className="px-4 py-2.5">Staff</th>
                <th className="px-3 py-2.5 text-right">On duty</th>
                <th className="px-3 py-2.5 text-right">Off</th>
                <th className="px-3 py-2.5 text-right">Leave</th>
                <th className="px-3 py-2.5 text-right">MC</th>
                <th className="px-3 py-2.5 text-right">Working hours</th>
                <th className="px-3 py-2.5 text-right">OT days</th>
                <th className="px-4 py-2.5 text-right">OT hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, sum }) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-2.5"><div className="font-extrabold text-text">{s.shortName}</div><div className="text-[11.5px] text-text-muted">{s.fullName}</div></td>
                  <td className="px-3 py-2.5 text-right">{sum.on_duty}</td>
                  <td className="px-3 py-2.5 text-right">{sum.off}</td>
                  <td className="px-3 py-2.5 text-right">{sum.leave}</td>
                  <td className="px-3 py-2.5 text-right">{sum.mc}</td>
                  <td className="px-3 py-2.5 text-right">{hoursText(Math.round(sum.worked * 100) / 100)}</td>
                  <td className="px-3 py-2.5 text-right">{sum.otDays}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-sky-800">{hoursText(Math.round(sum.ot * 100) / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-text-muted">
          OT hours come from the working times ticked &quot;OT hours&quot;, or the figure the admin set for that day. This is a reference for HR and payroll; staff still apply for OT in their OT Form.
        </p>
      </>
    );
  } else if (view === "history") {
    const changes = await loadRosterChanges(supabase, date);
    body = (
      <>
        <div className="text-[18px] font-extrabold text-text">Changes to the roster of {dayTitle(date)}</div>
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          {changes.length === 0 ? (
            <div className="px-5 py-6 text-center text-[13px] text-text-muted">No changes recorded for this day.</div>
          ) : (
            changes.map((c) => (
              <div key={c.id} className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-5 py-3 text-[13px] last:border-b-0">
                <div className="w-44 shrink-0 text-text-secondary">{formatMalaysiaDateTime(c.changedAt)}</div>
                <div className="w-40 shrink-0 font-semibold text-text">{c.changedByName}</div>
                <div className="min-w-0 flex-1 text-text">{c.summary}</div>
                <div className="text-[11.5px] text-text-muted">update {c.version}</div>
              </div>
            ))
          )}
        </div>
        <p className="text-[12px] text-text-muted">Every save is kept here with who made it and when. The history cannot be changed or deleted.</p>
      </>
    );
  } else if (view === "staff" && canEdit) {
    const { data: hr } = await supabase.from("employees").select("id, full_name, position, companies(name)").eq("status", "active").order("full_name");
    const seen = new Set<string>();
    const hrStaff = ((hr ?? []) as { id: string; full_name: string; position: string | null; companies: { name: string } | null }[])
      .filter((e) => (seen.has(e.full_name.toUpperCase()) ? false : (seen.add(e.full_name.toUpperCase()), true)))
      .map((e) => ({ id: e.id, name: e.full_name, detail: [e.position, e.companies?.name].filter(Boolean).join(" · ") }));
    body = <RosterStaffManager staff={staff} hrStaff={hrStaff} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <RosterNav date={date} today={today} view={view} views={views} />
      {body}
    </div>
  );
}

const round = (n: number) => String(Math.round(n * 100) / 100);
function lastDayOfMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

async function myStaffId(supabase: unknown, staff: RosterStaff[], userId: string): Promise<string | null> {
  const { data } = await untyped(supabase).from("employees").select("id, full_name").eq("user_id", userId);
  const mine = (data ?? []) as { id: string; full_name: string }[];
  const hit = staff.find((s) => mine.some((m) => m.id === s.employeeId || m.full_name.toUpperCase() === s.fullName.toUpperCase()));
  return hit?.id ?? null;
}

function weekTable(start: string, days: Map<string, DayRoster>, staff: RosterStaff[]): ExportTable {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return {
    title: `Jadual Driver & Operation - week of ${shortDay(start)} ${start.slice(0, 4)}`,
    columns: ["Staff", ...dates.map(shortDay)],
    rows: staff
      .filter((s) => s.active || dates.some((d) => days.get(d)?.entries.some((e) => e.staffId === s.id)))
      .map((s) => [
        s.shortName,
        ...dates.map((d) => {
          const e = days.get(d)?.entries.find((x) => x.staffId === s.id);
          if (!e) return "";
          if (e.status !== "on_duty") return STATUS[e.status].label;
          return [slotsLine(e), ...e.tasks.map((t) => `- ${taskLine(t)}`)].filter(Boolean).join("\n");
        }),
      ]),
    landscape: true,
  };
}
