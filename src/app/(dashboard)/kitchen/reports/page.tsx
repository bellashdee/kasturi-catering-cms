import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getDailyKitchenReport } from "@/lib/kitchen/queries";
import { PRODUCTION_STATUS_LABEL, PURCHASE_REQUEST_STATUS_LABEL } from "@/lib/kitchen/constants";
import { formatCurrency, todayInMalaysia } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";

function todayIso(): string {
  return todayInMalaysia();
}

export default async function KitchenReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; date?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, date: requestedDate } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const date = requestedDate || todayIso();

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const report = await getDailyKitchenReport(supabase, targetCompanyIds, date);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">Daily Kitchen Report</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          {requestedId && <input type="hidden" name="company" value={requestedId} />}
          <input type="date" name="date" defaultValue={date} className="h-10 rounded-lg border border-border-strong px-3 text-sm" />
          <button type="submit" className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            View Date
          </button>
        </form>
      </div>

      <KitchenSubNav />

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Production Orders</div>
          <div className="mt-1 text-xl font-extrabold text-text">{report.orders.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Ingredient Cost Used</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(report.consumedCost)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-danger">Wastage Cost</div>
          <div className="mt-1 text-xl font-extrabold text-danger">{formatCurrency(report.wastageCost)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Purchase Requests Pending</div>
          <div className="mt-1 text-xl font-extrabold text-text">{report.pendingPurchaseRequests.length}</div>
        </div>
      </div>

      <SectionCard title={`Production Orders — ${date}`}>
        {report.orders.length === 0 ? (
          <EmptyRow text="No production orders planned for this date." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {report.orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                <div>
                  <span className="font-semibold text-text">{o.recipes?.name ?? "Unlinked order"}</span>
                  <span className="ml-2 text-text-muted">{o.companies?.name} · {o.pax_count ?? "—"} pax</span>
                </div>
                <StatusBadge tone={o.status === "completed" ? "success" : o.status === "in_progress" ? "info" : "warning"}>
                  {PRODUCTION_STATUS_LABEL[o.status] ?? o.status}
                </StatusBadge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-2 gap-5">
        <SectionCard title="Stock Consumed Today">
          {report.consumed.length === 0 ? (
            <EmptyRow text="No stock consumption recorded for this date." />
          ) : (
            <div className="-mx-5 -mb-5 divide-y divide-border">
              {report.consumed.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                  <span className="font-medium text-text">{m.ingredients?.name}</span>
                  <span className="text-text-secondary">{Math.abs(Number(m.quantity))} {m.ingredients?.unit_of_measure ?? ""}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Wastage Today">
          {report.wastage.length === 0 ? (
            <EmptyRow text="No wastage recorded for this date." />
          ) : (
            <div className="-mx-5 -mb-5 divide-y divide-border">
              {report.wastage.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                  <span className="font-medium text-text">{m.ingredients?.name}</span>
                  <span className="text-danger">{Math.abs(Number(m.quantity))} {m.ingredients?.unit_of_measure ?? ""}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Purchase Requests Pending">
        {report.pendingPurchaseRequests.length === 0 ? (
          <EmptyRow text="No purchase requests pending." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {report.pendingPurchaseRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                <div>
                  <span className="font-medium text-text">{r.ingredients?.name}</span>
                  <span className="ml-2 text-text-muted">{r.companies?.name} · {r.suppliers?.name ?? "No supplier yet"}</span>
                </div>
                <span className="font-semibold text-text">{r.quantity_requested} {r.unit ?? ""}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-text-muted">{PURCHASE_REQUEST_STATUS_LABEL.pending} requests only — see Purchase Requests for the full history.</p>
      </SectionCard>
    </div>
  );
}
