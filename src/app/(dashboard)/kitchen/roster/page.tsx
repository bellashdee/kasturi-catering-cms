import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { isRestaurantScope } from "@/lib/restaurantView";
import { DEFAULT_KITCHEN, type Roster, type RosterRow, type ShiftCode } from "@/lib/kitchen/roster";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { DutyRosterBoard } from "@/components/kitchen/DutyRosterBoard";

type RosterRecord = {
  id: string;
  company_id: string;
  kitchen: string;
  month: string;
  public_holidays: number[] | null;
  notes: string | null;
  prepared_at: string | null;
  approved_at: string | null;
};
type RowRecord = { id: string; roster_id: string; employee_id: string | null; display_name: string; sort_order: number; codes: Record<string, string> | null };

const thisMonth = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7);

/**
 * Kitchen → Duty Roster: the monthly shift schedule of the kitchen staff, in the format of "KILANG 1 DUTY ROASTER 2026.xlsx"
 * (one row per staff member, one column per day, a shift code in each box, the shift times below). Chef Atiq (and a Super Admin)
 * edits it; everyone else in the company sees it.
 */
export default async function DutyRosterPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string; kitchen?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const sp = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  const restaurant = isRestaurantScope(companies, targetCompanyIds);
  const title = restaurant ? "Kitchen & Stock" : "Kitchen";
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  // the roster belongs to one company: the one chosen at the top, else Kasturi Indah (the central kitchen), else the first one
  const scoped = companies.filter((c) => targetCompanyIds.includes(c.id));
  const company = scoped.find((c) => c.id === sp.company) ?? scoped.find((c) => /kasturi indah/i.test(c.name)) ?? scoped[0];
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth();
  const kitchen = (sp.kitchen ?? DEFAULT_KITCHEN).trim().toUpperCase() || DEFAULT_KITCHEN;

  const db = untyped(supabase);
  const [{ data: codes }, { data: rosters }, { data: canEditFlag }, { data: superFlag }, { data: staff }] = await Promise.all([
    db.from("kitchen_roster_shift_codes").select("*").order("sort_order"),
    db.from("kitchen_rosters").select("id, company_id, kitchen, month, public_holidays, notes, prepared_at, approved_at").eq("company_id", company.id).order("month", { ascending: false }),
    db.rpc("user_can_edit_kitchen_roster"),
    supabase.rpc("current_user_is_super_admin"),
    // the "Add staff" choices: the kitchen staff only (kitchen_roster_staff), with their short name
    db.from("kitchen_roster_staff").select("employee_id, full_name, short_name").order("sort_order"),
  ]);
  const all = (rosters ?? []) as RosterRecord[];
  const kitchens = [...new Set([DEFAULT_KITCHEN, ...all.map((r) => r.kitchen), kitchen])].sort();
  const current = all.find((r) => r.kitchen === kitchen && r.month.slice(0, 7) === month) ?? null;
  // the latest earlier roster of this kitchen, to copy the staff and the pattern from
  const previous = all.filter((r) => r.kitchen === kitchen && r.month.slice(0, 7) < month).sort((a, b) => b.month.localeCompare(a.month))[0] ?? null;

  const ids = [current?.id, previous?.id].filter((x): x is string => !!x);
  const { data: rowData } = ids.length ? await db.from("kitchen_roster_rows").select("*").in("roster_id", ids).order("sort_order") : { data: [] };
  const rowsOf = (id: string | undefined): RosterRow[] =>
    ((rowData ?? []) as RowRecord[]).filter((r) => r.roster_id === id).map((r) => ({ id: r.id, employeeId: r.employee_id, displayName: r.display_name, codes: r.codes ?? {} }));
  const people = current ? ((await db.rpc("kitchen_roster_people", { target_roster_id: current.id })).data?.[0] as { prepared_name: string | null; approved_name: string | null } | undefined) : undefined;

  const roster: Roster = {
    id: current?.id ?? null,
    companyId: company.id,
    kitchen,
    month,
    publicHolidays: current?.public_holidays ?? [],
    notes: current?.notes ?? null,
    preparedName: people?.prepared_name ?? null,
    preparedAt: current?.prepared_at ?? null,
    approvedName: people?.approved_name ?? null,
    approvedAt: current?.approved_at ?? null,
    rows: rowsOf(current?.id),
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">{title}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Duty Roster · {company.name} · {kitchen}</p>
      </div>
      <KitchenSubNav />
      <DutyRosterBoard
        key={`${company.id}-${kitchen}-${month}-${current?.id ?? "new"}`}
        roster={roster}
        previousRows={previous ? rowsOf(previous.id) : []}
        previousMonth={previous ? previous.month.slice(0, 7) : null}
        codes={(codes ?? []) as ShiftCode[]}
        kitchens={kitchens}
        staff={((staff ?? []) as { employee_id: string; full_name: string; short_name: string }[]).map((e) => ({ id: e.employee_id, name: e.full_name, shortName: e.short_name }))}
        canEdit={canEditFlag === true}
        canApprove={superFlag === true}
        savedMonths={all.filter((r) => r.kitchen === kitchen).map((r) => r.month.slice(0, 7))}
      />
    </div>
  );
}
