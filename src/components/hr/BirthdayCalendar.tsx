import type { CalendarBirthday } from "@/lib/hr/birthdays";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthCard({ year, month, birthdays, today }: { year: number; month: number; birthdays: CalendarBirthday[]; today: string }) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const offset = (first + 6) % 7; // the week starts on Monday
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const byDay = new Map<number, CalendarBirthday[]>();
  for (const b of birthdays) byDay.set(b.day, [...(byDay.get(b.day) ?? []), b]);
  const cells: (number | null)[] = [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const isThisMonth = today.slice(0, 7) === `${year}-${String(month + 1).padStart(2, "0")}`;
  const todayDay = isThisMonth ? Number(today.slice(8, 10)) : 0;

  return (
    <section aria-label={`${MONTH_NAMES[month]} ${year}`} className={`overflow-hidden rounded-2xl border bg-surface shadow-sm ${isThisMonth ? "border-primary/50 ring-2 ring-primary/15" : "border-border"}`}>
      <header className={`flex items-center justify-between px-4 py-3 ${isThisMonth ? "bg-primary text-white" : "bg-navy-900 text-white"}`}>
        <h2 className="text-[15px] font-extrabold tracking-wide">{MONTH_NAMES[month]}</h2>
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-bold">{birthdays.length === 0 ? "—" : `${birthdays.length} 🎂`}</span>
      </header>
      <div className="grid grid-cols-7 border-b border-border bg-surface-alt text-center text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const people = day ? (byDay.get(day) ?? []) : [];
          return (
            <div key={i} className={`min-h-[3.4rem] border-b border-r border-border/60 p-1 ${i % 7 === 6 ? "border-r-0" : ""} ${day ? "" : "bg-surface-alt/60"} ${people.length ? "bg-[#fff6dc]" : ""}`}>
              {day && (
                <>
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${day === todayDay ? "bg-primary text-white" : people.length ? "bg-[#d4a017] text-white" : "text-text-secondary"}`}>{day}</div>
                  {people.map((p) => (
                    <div key={p.name} title={p.name} className="mt-0.5 truncate text-[10px] font-extrabold leading-tight text-[#6b4a06]">{p.shortName}</div>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
      {birthdays.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border px-4 py-3">
          {birthdays.map((b) => (
            <li key={b.name} className="flex items-baseline gap-2 text-[13px]">
              <span className="w-12 shrink-0 font-bold tabular-nums text-[#8a5a0b]">{`${b.day} ${MONTH_NAMES[month].slice(0, 3)}`}</span>
              <span className="font-extrabold text-text">{b.shortName}</span>
              <span className="min-w-0 truncate text-[11.5px] text-text-muted" title={b.name}>{b.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A whole year of birthdays: one calendar per month, the birthday days marked and labelled with the staff short names. */
export function BirthdayCalendar({ year, months, today }: { year: number; months: CalendarBirthday[][]; today: string }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {months.map((list, m) => (
        <MonthCard key={m} year={year} month={m} birthdays={list} today={today} />
      ))}
    </div>
  );
}
