import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { todayInMalaysia } from "@/lib/format";
import { birthdaysByMonth, loadBirthdayRows } from "@/lib/hr/birthdays";
import { BirthdayCalendar } from "@/components/hr/BirthdayCalendar";
import { EmptyRow } from "@/components/dashboard/SectionCard";

export const metadata = { title: "Birthday Calendar" };

/** The birthdays of all staff in one calendar, by month (open to everyone who is signed in; only the day and month are shown). */
export default async function BirthdaysPage({ searchParams }: { searchParams: Promise<{ company?: string; year?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const { company: requestedId, year: yearParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const today = todayInMalaysia();
  const thisYear = Number(today.slice(0, 4));
  const year = Number(yearParam) >= 2000 && Number(yearParam) <= 2100 ? Number(yearParam) : thisYear;
  const rows = await loadBirthdayRows(supabase, targetCompanyIds);
  const { months, unknown } = birthdaysByMonth(rows, year);
  const total = months.reduce((t, m) => t + m.length, 0);
  const query = (y: number) => `?${new URLSearchParams({ ...(requestedId ? { company: requestedId } : {}), year: String(y) }).toString()}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold text-text">🎂 Birthday Calendar {year}</h1>
          <p className="mt-0.5 text-[13.5px] text-text-secondary">
            {total} staff birthday{total === 1 ? "" : "s"} by month. Each day is labelled with the staff short name.
            {unknown > 0 ? ` ${unknown} staff have no date of birth yet.` : ""}
          </p>
        </div>
        <nav aria-label="Year" className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Link href={query(year - 1)} className="rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-text hover:bg-bg">← {year - 1}</Link>
          {year !== thisYear && <Link href={query(thisYear)} className="rounded-lg bg-primary px-3.5 py-2 text-white">This year</Link>}
          <Link href={query(year + 1)} className="rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-text hover:bg-bg">{year + 1} →</Link>
        </nav>
      </div>
      <BirthdayCalendar year={year} months={months} today={today} />
    </div>
  );
}
