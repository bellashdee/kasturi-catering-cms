import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { dayAmount, dayPax, type EventDay } from "@/lib/catering/days";
import type { ExtraItem } from "@/lib/catering/quotationRequest";
import { formatCurrency, formatPrice } from "@/lib/format";
import { QuotationRequestActions } from "@/components/catering/QuotationRequestActions";

export default async function QuotationRequestsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  const [{ data: rows }, { data: customers }] = await Promise.all([
    supabase.from("quotation_requests").select("*, companies(name)").in("company_id", targetCompanyIds).order("created_at", { ascending: false }).limit(200),
    supabase.from("customers").select("company_id, name").in("company_id", targetCompanyIds),
  ]);
  const requests = rows ?? [];
  const knownCustomers = new Set((customers ?? []).map((c) => `${c.company_id}|${c.name.trim().toLowerCase()}`));
  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/catering${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Events</Link>
        <h1 className="mt-1 text-[22px] font-extrabold text-text">Quotation Requests</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Requests sent by sales agents through the quotation form. Approving one creates the event (as an enquiry) and a draft quotation.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3 text-[13px] font-bold text-text">Waiting for review ({pending.length})</div>
        {pending.length === 0 ? (
          <EmptyRow text="Nothing waiting for review." />
        ) : (
          <div className="divide-y divide-border">
            {pending.map((r) => {
              const days = r.days as unknown as EventDay[];
              const extras = r.extra_items as unknown as ExtraItem[];
              const total = days.reduce((t, d) => t + dayAmount(d), 0) + extras.reduce((t, i) => t + i.quantity * i.unitPrice, 0);
              const isNewCustomer = !knownCustomers.has(`${r.company_id}|${r.customer_name.trim().toLowerCase()}`);
              return (
                <div key={r.id} className="flex items-start justify-between gap-4 px-5 py-4">
                  <div className="text-[13px]">
                    <div className="text-[14px] font-bold text-text">
                      {r.event_name} {companies.length > 1 && <span className="text-[11px] font-normal text-text-muted">{r.companies?.name}</span>}
                    </div>
                    <div className="text-text-secondary">
                      Customer: {r.customer_name} {isNewCustomer ? <StatusBadge tone="warning">New customer — will be created</StatusBadge> : <StatusBadge tone="success">Existing customer</StatusBadge>}
                    </div>
                    <div className="text-text-secondary">{[r.location, r.pic_name, r.pic_phone].filter(Boolean).join(" · ")}</div>
                    <div className="mt-2 flex flex-col gap-1">
                      {days.map((d, i) => (
                        <div key={d.dayDate} className="text-text-secondary">
                          <span className="font-semibold text-text">Day {i + 1} · {d.dayDate}</span>
                          {" — "}
                          {d.mealTypes.map((m) => MEAL_TYPE_LABEL[m] ?? m).join(", ") || "no meal type"}
                          {" · "}
                          {SERVICE_TYPE_LABEL[d.serviceType] ?? d.serviceType} {d.servicePax}
                          {d.secondServiceType ? ` + ${SERVICE_TYPE_LABEL[d.secondServiceType] ?? d.secondServiceType} ${d.secondServicePax}` : ""} pax
                          {d.pricePerPax ? ` · ${dayPax(d)} × ${formatPrice(d.pricePerPax)} = ${formatPrice(dayAmount(d))}` : " · no price"}
                          {d.menuDetails && <div className="whitespace-pre-line text-xs text-text-muted">{d.menuDetails}</div>}
                        </div>
                      ))}
                    </div>
                    {extras.length > 0 && (
                      <div className="mt-1 text-text-secondary">
                        <span className="font-semibold text-text">Extra:</span> {extras.map((i) => `${i.itemName} (${i.quantity} × ${formatPrice(i.unitPrice)})`).join("; ")}
                      </div>
                    )}
                    {r.kitchen_setup && <div className="mt-1 whitespace-pre-line text-text-secondary"><span className="font-semibold">Kitchen set-up:</span> {r.kitchen_setup}</div>}
                    {r.catering_setup && <div className="whitespace-pre-line text-text-secondary"><span className="font-semibold">Catering set-up:</span> {r.catering_setup}</div>}
                    {r.remarks && <div className="whitespace-pre-line text-text-secondary"><span className="font-semibold">Remarks:</span> {r.remarks}</div>}
                    <div className="mt-1 text-xs text-text-muted">
                      Sales agent: {r.sales_agent} · {r.created_at.slice(0, 10)} · Estimated total {formatCurrency(total)}
                    </div>
                  </div>
                  <QuotationRequestActions requestId={r.id} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {reviewed.length > 0 && (
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3 text-[13px] font-bold text-text">Reviewed</div>
          <div className="divide-y divide-border">
            {reviewed.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                <div>
                  <span className="font-semibold text-text">{r.event_name}</span>
                  <span className="ml-2 text-xs text-text-muted">{r.customer_name} · {r.sales_agent} · {r.created_at.slice(0, 10)}</span>
                </div>
                <div className="flex items-center gap-3">
                  {r.catering_event_id && <Link href={`/catering/${r.catering_event_id}${query}`} className="text-xs font-semibold text-primary">Open event</Link>}
                  <StatusBadge tone={r.status === "approved" ? "success" : "neutral"}>{r.status === "approved" ? "Approved" : "Rejected"}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
