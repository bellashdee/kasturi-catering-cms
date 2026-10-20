import Link from "next/link";
import type { Birthday } from "@/lib/hr/birthdays";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayMonth(monthDay: string) {
  const [m, d] = monthDay.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/**
 * Birthday wishes on the main dashboard: a personal greeting for the signed-in person on their own birthday, a greeting for every
 * other colleague whose birthday is today, and the birthdays of the coming week. Only the day and month are shown, never the age.
 */
export function BirthdayCard({ birthdays, companyQuery = "" }: { birthdays: Birthday[]; companyQuery?: string }) {
  const today = birthdays.filter((b) => b.daysAway === 0);
  const soon = birthdays.filter((b) => b.daysAway > 0);
  const calendarLink = (
    <Link href={`/birthdays${companyQuery}`} className="text-[13px] font-semibold text-primary hover:underline">
      🎂 Birthday calendar (all months)
    </Link>
  );
  if (today.length === 0 && soon.length === 0) return <div>{calendarLink}</div>;
  const me = today.find((b) => b.isMe);
  const others = today.filter((b) => !b.isMe);

  return (
    <section aria-label="Birthdays" className="flex flex-col gap-3">
      {me && (
        <div className="rounded-2xl border border-[#e3c98a] bg-gradient-to-r from-[#fff7e0] to-[#fdebc4] px-6 py-5 shadow-sm">
          <div className="text-[22px] font-extrabold text-[#6b4a06]">{`🎂 Happy Birthday, ${me.name}!`}</div>
          <p className="mt-1 text-[14.5px] text-[#6b4a06]">Everyone at the company wishes you good health, happiness and a wonderful year ahead.</p>
        </div>
      )}
      {others.length > 0 && (
        <div className="rounded-2xl border border-[#e3c98a] bg-[#fff9ea] px-6 py-4 shadow-sm">
          <div className="text-[16px] font-extrabold text-[#6b4a06]">🎉 Happy Birthday today</div>
          <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1">
            {others.map((b) => (
              <li key={b.name} className="text-[14.5px] font-semibold text-text">
                {b.name}
                {b.companies.length > 0 && <span className="ml-1.5 text-[12px] font-normal text-text-muted">{b.companies.join(" · ")}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {soon.length > 0 && (
        <div className="rounded-xl border border-border bg-surface px-5 py-3 text-[13.5px] text-text-secondary shadow-sm">
          <span className="font-bold text-text">Upcoming birthdays:</span>{" "}
          {soon.map((b, i) => (
            <span key={b.name}>
              {i > 0 && " · "}
              <span className="font-semibold text-text" title={b.name}>{b.shortName}</span> {dayMonth(b.monthDay)}
              {b.daysAway === 1 ? " (tomorrow)" : ""}
            </span>
          ))}
          <span className="ml-3">{calendarLink}</span>
        </div>
      )}
      {soon.length === 0 && <div>{calendarLink}</div>}
    </section>
  );
}
