import Link from "next/link";
import { EVENT_STATUS_LABEL } from "@/lib/catering/constants";
import { formatTime12 } from "@/lib/format";
import type { JdtScheduleRow } from "@/lib/catering/jdtSchedule";

const STATUS_STYLE: Record<string, string> = {
  date_confirmed: "bg-blue-100 text-blue-800 border-blue-600",
  details_pending: "bg-yellow-100 text-yellow-900 border-yellow-500",
  ready_for_planning: "bg-success-bg text-success border-success",
  confirmed: "bg-success-bg text-success border-success",
  in_production: "bg-success-bg text-success border-success",
  cancelled: "bg-danger-bg text-danger border-danger",
};

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));

function Pill({ status, away }: { status: string; away: boolean }) {
  const text = away ? "Away · info only" : EVENT_STATUS_LABEL[status] ?? status;
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-bold ${away ? "border-border-strong bg-surface-alt text-text-secondary" : STATUS_STYLE[status] ?? "border-border bg-surface-alt text-text"}`}>{text}</span>;
}

const pendingCls = (v: string | number) => (v === "Pending" ? "font-bold text-yellow-800" : v === "No catering" ? "text-text-muted" : "font-semibold text-text");

/** UPCOMING JDT EVENTS: every JDT date of Signature Solution coming up, with whether the menu and pax are in yet. No money is shown. */
export function UpcomingJdtEvents({ rows, canOpen, query = "", days = 60 }: { rows: JdtScheduleRow[]; canOpen: boolean; query?: string; days?: number }) {
  const pending = rows.filter((r) => !r.away && r.status !== "cancelled" && (r.menu === "Pending" || r.pax === "Pending")).length;
  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[15px] font-extrabold tracking-wide text-text">UPCOMING JDT EVENTS</h2>
          <p className="text-[12px] text-text-secondary">{`Signature Solution · next ${days} days · ${rows.length} date(s)`}{pending > 0 ? ` · ${pending} waiting for menu / pax` : ""}</p>
        </div>
        {canOpen && (
          <Link href={`/catering/calendar${query}`} className="text-[13px] font-semibold text-primary hover:underline">
            Event Calendar →
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-4 text-[13px] text-text-secondary">No JDT dates in the next {days} days.</div>
      ) : (
        <>
          {/* phone: one card per match */}
          <ul className="divide-y divide-border md:hidden">
            {rows.map((r) => {
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[13.5px] font-bold text-text">{dayLabel(r.date)}</div>
                    <Pill status={r.status} away={r.away} />
                  </div>
                  <div className="mt-0.5 text-[13px] font-semibold text-text">{r.match || "JDT Match"}</div>
                  <div className="mt-0.5 text-[12.5px] text-text-secondary">{[r.kickOff ? `Kick-off ${formatTime12(r.kickOff)}` : "Kick-off not provided", r.venue ?? "Venue not provided"].join(" · ")}</div>
                  <div className="mt-0.5 text-[12.5px]">
                    Menu: <span className={pendingCls(r.menu)}>{r.menu}</span> · Pax: <span className={pendingCls(r.pax)}>{r.pax}</span>
                  </div>
                  {r.remarks && !r.away && <div className="mt-0.5 line-clamp-2 text-[12px] text-text-muted">{r.remarks}</div>}
                </>
              );
              return (
                <li key={r.id} className={`px-4 py-3 ${r.status === "cancelled" ? "opacity-60" : ""}`}>
                  {canOpen ? <Link href={`/catering/${r.id}${query}`} className="block">{inner}</Link> : inner}
                </li>
              );
            })}
          </ul>
          {/* computer: a table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-alt text-left text-[11.5px] font-bold uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2">Match date</th>
                  <th className="px-3 py-2">Match details</th>
                  <th className="px-3 py-2">Venue</th>
                  <th className="px-3 py-2">Kick-off</th>
                  <th className="px-3 py-2">Menu</th>
                  <th className="px-3 py-2">Pax</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className={r.status === "cancelled" ? "opacity-60" : ""}>
                    <td className="whitespace-nowrap px-4 py-2 font-semibold text-text">{dayLabel(r.date)}</td>
                    <td className="px-3 py-2 font-semibold text-text">
                      {canOpen ? <Link href={`/catering/${r.id}${query}`} className="hover:underline">{r.match || "JDT Match"}</Link> : r.match || "JDT Match"}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{r.venue ?? "Not provided"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{r.kickOff ? formatTime12(r.kickOff) : "Not provided"}</td>
                    <td className={`px-3 py-2 ${pendingCls(r.menu)}`}>{r.menu}</td>
                    <td className={`px-3 py-2 ${pendingCls(r.pax)}`}>{r.pax}</td>
                    <td className="px-3 py-2"><Pill status={r.status} away={r.away} /></td>
                    <td className="max-w-[16rem] px-3 py-2 text-[12px] text-text-muted"><span className="line-clamp-2">{r.away ? "" : r.remarks ?? ""}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
