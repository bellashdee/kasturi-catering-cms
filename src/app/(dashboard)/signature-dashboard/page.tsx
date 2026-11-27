import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { canAccessModule } from "@/lib/modules";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { UpcomingJdtEvents } from "@/components/catering/UpcomingJdtEvents";
import { SnackFundCard } from "@/components/snack/SnackFundCard";
import { loadUpcomingJdt } from "@/lib/catering/jdtSchedule";
import { SIGNATURE_COMPANY_ID } from "@/lib/catering/constants";
import { TRACKING_STATUS_LABEL, TRACKING_STATUS_TONE } from "@/lib/catering/quotationRequest";
import { SNACK_OPEN_STATUSES, SNACK_STATUS_LABEL, SNACK_STATUS_TONE } from "@/lib/snack/constants";
import { canHandleSnacks, listSnackRequests, loadSnackFund } from "@/lib/snack/queries";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { formatMalaysiaDate, formatTime12, todayInMalaysia } from "@/lib/format";

const d = (iso: string | null | undefined) => (iso ? formatMalaysiaDate(`${iso}T12:00:00+08:00`) : "Pending");
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Action = { tone: "danger" | "warning" | "info"; text: string; href?: string };

/**
 * SIGNATURE SOLUTION DASHBOARD: the JDT match schedule, the catering quotation requests, the JDT training snack requests, purchasing and
 * the JDT II Snack Fund on one page, with the actions still pending. Each department sees what it may: no money for Kitchen / Drivers,
 * quotation requests only for Admin / Management.
 */
export default async function SignatureDashboardPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id, name");
  const sp = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies ?? [], sp.company);
  const query = sp.company ? `?company=${sp.company}` : "";
  if (!accessibleIds.includes(SIGNATURE_COMPANY_ID)) return <EmptyRow text="The Signature Solution Dashboard is for the staff of Signature Solution Sdn Bhd." />;

  const today = todayInMalaysia();
  const [{ data: inboxAccess }, money, { data: isMgmt }] = await Promise.all([
    supabase.rpc("user_has_quotation_request_access"),
    canHandleSnacks(supabase),
    supabase.rpc("user_is_company_admin", { target_company_id: SIGNATURE_COMPANY_ID }),
  ]);
  const inbox = inboxAccess === true;
  const canCatering = canAccessModule(session.allowedModules, "catering");
  const canSnackPages = canAccessModule(session.allowedModules, "supplier-procurement") || money;

  const [jdt, snacks, fund, requestsRes, draftsRes] = await Promise.all([
    loadUpcomingJdt(today, 60).catch(() => []),
    listSnackRequests(supabase, 100).catch(() => []),
    money ? loadSnackFund(supabase).catch(() => null) : Promise.resolve(null),
    inbox
      ? supabase.from("quotation_requests").select("id, request_code, event_name, customer_name, tracking_status, created_at, days, catering_event_id").eq("company_id", SIGNATURE_COMPANY_ID).order("created_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] as never[] }),
    inbox ? untyped(supabase).from("whatsapp_imports").select("id", { count: "exact", head: true }).eq("company_id", SIGNATURE_COMPANY_ID).eq("status", "draft") : Promise.resolve({ count: 0 }),
  ]);
  const requests = (requestsRes.data ?? []) as { id: string; request_code: string | null; event_name: string | null; customer_name: string | null; tracking_status: string; created_at: string; days: unknown; catering_event_id: string | null }[];
  const openSnacks = snacks.filter((s) => SNACK_OPEN_STATUSES.includes(s.status) || s.status === "delivered");

  // ---- pending actions ----
  const actions: Action[] = [];
  for (const m of jdt.filter((r) => !r.away && r.status !== "cancelled" && r.date <= addDays(today, 14) && (r.menu === "Pending" || r.pax === "Pending")))
    actions.push({ tone: m.date <= addDays(today, 3) ? "danger" : "warning", text: `JDT match ${d(m.date)} (${m.match}): date confirmed but ${[m.menu === "Pending" && "menu", m.pax === "Pending" && "pax"].filter(Boolean).join(" and ")} pending.`, href: canCatering ? `/catering/${m.id}${query}` : undefined });
  if (inbox) {
    const waiting = requests.filter((r) => r.tracking_status === "new_request");
    if (waiting.length > 0) actions.push({ tone: "warning", text: `${waiting.length} quotation request(s) awaiting Admin review.`, href: `/catering/quotation-requests${query}` });
    const drafts = (draftsRes as { count: number | null }).count ?? 0;
    if (drafts > 0) actions.push({ tone: "info", text: `${drafts} WhatsApp import draft(s) not submitted yet.`, href: `/catering/quotation-requests/whatsapp${query}` });
  }
  const awaitingPurchasing = snacks.filter((s) => ["new_request", "pending_confirmation", "approved"].includes(s.status));
  if (awaitingPurchasing.length > 0) actions.push({ tone: "warning", text: `${awaitingPurchasing.length} JDT II snack request(s) awaiting Purchasing.`, href: canSnackPages ? `/supplier-procurement/jdt-snacks${query}` : undefined });
  const notBought = openSnacks.filter((s) => s.status !== "delivered").flatMap((s) => s.jdt_snack_items.filter((i) => i.item_status === "pending").map((i) => ({ s, i })));
  if (notBought.length > 0) actions.push({ tone: notBought.some(({ s }) => s.training_date && s.training_date <= addDays(today, 1)) ? "danger" : "info", text: `${notBought.length} snack item(s) not yet purchased.`, href: canSnackPages ? `/supplier-procurement/jdt-snacks${query}` : undefined });
  const notDelivered = snacks.filter((s) => ["purchased", "purchase_in_progress", "approved"].includes(s.status) && s.training_date && s.training_date <= today);
  if (notDelivered.length > 0) actions.push({ tone: "danger", text: `${notDelivered.length} snack request(s) for a training today or earlier not delivered yet.`, href: canSnackPages ? `/supplier-procurement/jdt-snacks${query}` : undefined });
  const dateChecks = snacks.filter((s) => s.date_needs_check && s.status !== "cancelled");
  if (dateChecks.length > 0 && canSnackPages) actions.push({ tone: "info", text: `${dateChecks.length} snack request(s) where the year of the training date needs checking.`, href: `/supplier-procurement/jdt-snacks${query}` });
  if (fund?.alert) actions.push({ tone: "danger", text: fund.alert, href: `/supplier-procurement/jdt-snacks${query}` });
  if (fund && fund.status === "Not Yet Received") actions.push({ tone: "info", text: "The JDT II Snack Fund (RM500) is not marked as received yet.", href: `/supplier-procurement/jdt-snacks${query}` });

  const statusCounts = Object.keys(SNACK_STATUS_LABEL).map((k) => ({ k, n: snacks.filter((s) => s.status === k).length })).filter((x) => x.n > 0);
  const allItems = openSnacks.flatMap((s) => s.jdt_snack_items);
  const card = "rounded-xl border border-border bg-surface shadow-sm";
  const tone: Record<Action["tone"], string> = { danger: "border-danger/40 bg-danger-bg text-danger", warning: "border-yellow-500 bg-yellow-50 text-yellow-900", info: "border-border bg-surface-alt text-text" };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Signature Solution Dashboard</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">JDT match schedule, catering quotation requests, JDT training snack requests, purchasing and the JDT II Snack Fund — for Signature Solution Sdn Bhd.</p>
      </div>

      <section className={`${card} p-4`}>
        <h2 className="text-[15px] font-extrabold text-text">Pending actions</h2>
        {actions.length === 0 ? (
          <div className="mt-1 text-[13px] text-success">Nothing pending. ✓</div>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {actions.map((a, i) => (
              <li key={i}>
                {a.href ? (
                  <Link href={a.href} className={`block rounded-lg border px-3 py-2 text-[13px] font-semibold hover:opacity-90 ${tone[a.tone]}`}>
                    {a.text} →
                  </Link>
                ) : (
                  <div className={`rounded-lg border px-3 py-2 text-[13px] font-semibold ${tone[a.tone]}`}>{a.text}</div>
                )}
              </li>
            ))}
          </ul>
        )}
        {inbox && (
          <Link href={`/catering/quotation-requests/whatsapp${query}`} className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-[13.5px] font-bold text-white">
            + Import a WhatsApp message from Boss
          </Link>
        )}
      </section>

      <UpcomingJdtEvents rows={jdt} canOpen={canCatering} query={query} />

      {inbox && (
        <section className={card}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[15px] font-extrabold text-text">Catering / Event Quotation Requests</h2>
            <Link href={`/catering/quotation-requests${query}`} className="text-[13px] font-semibold text-primary hover:underline">
              Inbox →
            </Link>
          </div>
          {requests.length === 0 ? (
            <div className="px-4 py-4 text-[13px] text-text-muted">No quotation request yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((r) => {
                const dates = ((r.days as { dayDate?: string }[] | null) ?? []).map((x) => x.dayDate).filter(Boolean) as string[];
                return (
                  <li key={r.id}>
                    <Link href={`/catering/quotation-requests/${r.id}${query}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-alt">
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-semibold text-text">{`${r.request_code ?? ""} · ${r.event_name ?? "—"}`}</div>
                        <div className="text-[12px] text-text-muted">{`${r.customer_name ?? ""} · ${dates.map((x) => d(x)).join(", ") || "date pending"}${r.catering_event_id ? " · event linked" : ""}`}</div>
                      </div>
                      <StatusBadge tone={TRACKING_STATUS_TONE[r.tracking_status] ?? "neutral"}>{TRACKING_STATUS_LABEL[r.tracking_status] ?? r.tracking_status}</StatusBadge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className={card}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-extrabold text-text">JDT Training Snack Requests</h2>
          {canSnackPages && (
            <Link href={`/supplier-procurement/jdt-snacks${query}`} className="text-[13px] font-semibold text-primary hover:underline">
              Purchasing page →
            </Link>
          )}
        </div>
        {openSnacks.length === 0 ? (
          <div className="px-4 py-4 text-[13px] text-text-muted">No open snack request.</div>
        ) : (
          <ul className="divide-y divide-border">
            {openSnacks.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-bold text-text">{`${s.team} · training ${d(s.training_date)}`}</span>
                  {s.date_needs_check && <span className="rounded bg-yellow-50 px-1.5 py-0.5 text-[11px] font-bold text-yellow-900">! check the year</span>}
                  <StatusBadge tone={SNACK_STATUS_TONE[s.status] ?? "neutral"}>{SNACK_STATUS_LABEL[s.status] ?? s.status}</StatusBadge>
                  <span className="text-[12px] text-text-muted">{[s.delivery_time ? `deliver ${formatTime12(s.delivery_time.slice(0, 5))}` : "", s.delivery_location ?? ""].filter(Boolean).join(" · ")}</span>
                </div>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {s.jdt_snack_items.map((i) => (
                    <li key={i.id} className={`rounded-full border px-2 py-0.5 text-[12px] ${i.item_status === "purchased" ? "border-success/40 bg-success-bg text-success" : i.item_status === "unavailable" ? "border-danger/40 bg-danger-bg text-danger" : "border-border bg-surface-alt text-text"}`}>
                      {`${i.name} · ${i.requested_qty ? `${i.requested_qty} ${i.unit ?? ""}` : "qty pending"}`}
                      {i.remarks ? ` (${i.remarks})` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} p-4`}>
        <h2 className="text-[15px] font-extrabold text-text">Purchasing Status</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {statusCounts.length === 0 && <span className="text-[13px] text-text-muted">No snack request yet.</span>}
          {statusCounts.map(({ k, n }) => (
            <span key={k} className="rounded-lg bg-surface-alt px-3 py-1.5 text-[13px]">
              <b>{n}</b> {SNACK_STATUS_LABEL[k]}
            </span>
          ))}
        </div>
        {allItems.length > 0 && (
          <div className="mt-2 text-[13px] text-text-secondary">
            {`Open requests: ${allItems.filter((i) => i.item_status === "purchased" || i.item_status === "substituted").length} of ${allItems.length} item(s) bought · ${allItems.filter((i) => i.item_status === "unavailable").length} unavailable · ${allItems.filter((i) => !i.requested_qty).length} quantity pending`}
          </div>
        )}
      </section>

      {fund && <SnackFundCard fund={fund} canManage={money} isManagement={isMgmt === true} compact />}
    </div>
  );
}
