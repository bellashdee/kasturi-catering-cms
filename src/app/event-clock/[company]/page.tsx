import { notFound } from "next/navigation";
import { GuestLanguageBar } from "@/components/i18n/GuestLanguageBar";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVENT_CLOCK_COMPANIES } from "@/lib/eventAttendance/rules";
import { EventClockForm } from "@/components/driver/EventClockForm";

export const metadata = { title: "Event Clock In / Out" };
export const dynamic = "force-dynamic";

export default async function EventClockPage({ params }: { params: Promise<{ company: string }> }) {
  const { company: slug } = await params;
  const company = EVENT_CLOCK_COMPANIES[slug];
  if (!company) notFound();

  // only the names of the active drivers of this company are offered (the person picks their own name)
  const { data } = await createAdminClient().from("driver_profiles").select("id, employees(full_name, status)").eq("company_id", company.id);
  const drivers = (data ?? [])
    .filter((d) => d.employees?.status === "active")
    .map((d) => ({ id: d.id, name: d.employees?.full_name ?? "", companySlug: slug }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <GuestLanguageBar />
      <div className="text-[13px] font-bold uppercase tracking-wide text-text-secondary">{company.name}</div>
      <h1 className="mt-1 text-[24px] font-extrabold text-text">Event Clock In / Clock Out</h1>
      <p className="mt-1 text-[14px] text-text-secondary">For the staff on duty at an event. Choose your name, fill in the event and press Clock In when you arrive and Clock Out when you finish.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <EventClockForm companies={[{ slug, name: company.name }]} drivers={drivers} />
      </div>
    </div>
  );
}
