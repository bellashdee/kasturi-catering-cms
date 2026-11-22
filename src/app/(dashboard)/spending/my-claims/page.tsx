import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { canAccessModule } from "@/lib/modules";
import { ownIdentity, pettyCashAccess } from "@/lib/pettyCash/access";
import { SoftHeader, SoftPage } from "@/components/ui/Soft";
import { SpendingSubNav } from "@/components/spending/SpendingSubNav";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimPayers } from "@/lib/pettyCash/access";
import { likeExact, loadPersonOptions, shortNameIn } from "@/lib/pettyCash/people";
import { createClient } from "@/lib/supabase/server";
import { formatMalaysiaDate, formatPrice, todayInMalaysia } from "@/lib/format";
import { PETTY_CASH_PAYMENT_STATUS_LABEL } from "@/lib/finance/constants";
import { paymentMethodLabel } from "@/lib/operationPettyCash/constants";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { ExportListButtons } from "@/components/procurement/ExportListButtons";
import { receiptIds } from "@/lib/documents/receipts";
import { fileSlug, formatRm, monthLabel, spendSummary, spentByCompany } from "@/lib/pettyCash/summary";
import { MyClaimActions, MyClaimForm } from "@/components/claims/MyClaims";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";
import { RESTAURANT_COMPANY_NAME, isRestaurantOnly } from "@/lib/restaurantView";
import { resolveCompanyScope } from "@/lib/companyScope";

const SORTS = { date: "Date", bought: "Description", invoice: "Invoice No.", amount: "Amount", status: "Status" };

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * My Claims: any staff member claims back, from Penny Chan or Nabilah, what they bought with their own money, and sees the history of
 * their purchases like the Petty Cash: by month, with the totals (claimed, paid, waiting) and the spending of each company, to export or
 * print. A person sees and works on only their own claims (the staff have no access to the petty cash records themselves, so this page
 * reads them with the service role and keeps to the claims the person made). Admin & Finance can choose another staff member to see,
 * print or export that person's claims (only in the companies they can open); they cannot change someone else's claims here.
 */
export default async function MyClaimsPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string; q?: string; status?: string; sort?: string; dir?: string; staff?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const sp = await searchParams;

  const admin = createAdminClient();
  const supabase = await createClient();
  const [{ data: records }, { data: companyRows }, payers, people, access] = await Promise.all([
    admin.from("employees").select("company_id").eq("user_id", session.userId).eq("status", "active"),
    admin.from("companies").select("id, name").order("name"),
    claimPayers(),
    loadPersonOptions(supabase),
    pettyCashAccess(supabase, session.userId),
  ]);
  const hasFinance = canAccessModule(session.allowedModules, "finance-admin");
  const ownCompanyIds = Array.from(new Set((records ?? []).map((r) => r.company_id)));
  const allCompanies = companyRows ?? [];
  // a claim can be for any of the companies (the bill is chosen under the company it belongs to), once the staff record is linked
  const companies = ownCompanyIds.length > 0 ? allCompanies : [];
  // the position shown for Penny Chan / Nabilah is the one on the list of petty cash holders
  const payerList = payers.map((p) => ({ name: p.name, position: people.find((x) => x.name === p.name)?.position ?? p.position }));
  const short = shortNameIn(people);

  // whose claims: your own; Admin & Finance may choose another staff member (anyone who has a staff claim in a company they can open)
  const own = ownIdentity(people, session.userId, session.fullName);
  const { accessibleIds } = resolveCompanyScope(session, allCompanies, undefined);
  let staffOptions: string[] = [];
  if (hasFinance && accessibleIds.length > 0) {
    const { data: claimants } = await admin.from("petty_cash_transactions").select("claimant_name").eq("type", "expense").in("company_id", accessibleIds).not("claimant_name", "is", null).limit(10000);
    staffOptions = Array.from(new Map((claimants ?? []).map((c) => c.claimant_name?.trim() ?? "").filter(Boolean).map((n) => [n.toUpperCase(), n])).values())
      .filter((n) => n.toUpperCase() !== own.name.toUpperCase())
      .sort((a, b) => a.localeCompare(b));
  }
  const staff = staffOptions.find((n) => n.toUpperCase() === (sp.staff ?? "").trim().toUpperCase()) ?? "";
  const staffPerson = staff ? people.find((p) => p.name.toUpperCase() === staff.toUpperCase()) : undefined;
  const isOwn = !staff;
  const sheetName = staff || own.name;
  const sheetPosition = staff ? (staffPerson?.position ?? "") : own.position;

  let all: ClaimRow[] = [];
  if (isOwn) {
    all = (await readOwnClaims(admin, session.userId)).data ?? [];
  } else {
    // another staff member's claims: the ones under their name, and the ones they sent themselves from their login
    const [byName, byLogin] = await Promise.all([
      admin.from("petty_cash_transactions").select("*").eq("type", "expense").in("company_id", accessibleIds).ilike("claimant_name", likeExact(staff)),
      staffPerson?.userId ? admin.from("petty_cash_transactions").select("*").eq("type", "expense").in("company_id", accessibleIds).eq("created_by", staffPerson.userId) : Promise.resolve({ data: [] as ClaimRow[] }),
    ]);
    all = Array.from(new Map([...(byName.data ?? []), ...(byLogin.data ?? [])].map((c) => [c.id, c])).values()).sort(
      (a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at),
    );
  }

  // the history by month (this month by default, or All months), like the Petty Cash
  const thisMonth = todayInMalaysia().slice(0, 7);
  const months = Array.from(new Set([thisMonth, ...all.map((c) => c.transaction_date.slice(0, 7))])).sort().reverse();
  const month = sp.month && (sp.month === "all" || MONTH_RE.test(sp.month)) ? sp.month : thisMonth;
  const q = sp.q?.trim().toLowerCase() ?? "";
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const shown = sortBy(
    all.filter(
      (c) =>
        (month === "all" || c.transaction_date.startsWith(month)) &&
        (!sp.status || c.payment_status === sp.status) &&
        (!q || [c.description, c.category, c.invoice_no, c.remarks].some((x) => x?.toLowerCase().includes(q))),
    ),
    sort,
    dir,
    {
      date: [(c) => c.transaction_date, (c) => c.created_at],
      bought: [(c) => c.description, (c) => c.transaction_date],
      invoice: [(c) => c.invoice_no, (c) => c.transaction_date],
      amount: (c) => Number(c.amount),
      status: [(c) => PETTY_CASH_PAYMENT_STATUS_LABEL[c.payment_status] ?? c.payment_status, (c) => c.transaction_date],
    },
  );

  const sum = (list: typeof all) => list.reduce((t, c) => t + Number(c.amount), 0);
  const paid = shown.filter((c) => c.payment_status === "paid");
  const waiting = shown.filter((c) => c.payment_status !== "paid");
  const spent = shown.map((c) => ({ companyId: c.company_id, amount: Number(c.amount) }));
  const byCompany = spentByCompany(spent, allCompanies);
  const companyLabel = (c: (typeof all)[number]) =>
    [c.company_id, ...(c.shared_company_ids ?? [])].map((id) => allCompanies.find((x) => x.id === id)?.name).filter(Boolean).join(" + ");

  const exportHeaders = ["Date", "Company", "Category", "Description", "Invoice No.", "Remarks", "Claim from", isOwn ? "You paid by" : "Staff paid by", "Status", "Payment date", "Amount (RM)"];
  const exportRows = shown.map((c): (string | number)[] => [
    c.transaction_date,
    companyLabel(c),
    c.category ?? "",
    c.description ?? "",
    c.invoice_no ?? "",
    c.remarks ?? "",
    short(c.person_name),
    paymentMethodLabel(c.payment_method),
    PETTY_CASH_PAYMENT_STATUS_LABEL[c.payment_status] ?? c.payment_status,
    c.payment_date ?? "",
    Math.round(Number(c.amount) * 100) / 100,
  ]);
  // the printout / Excel carries the staff member's full name, the company, the period and the totals on top, and their sign-off at the end
  const sheetInfo = [
    { label: "Staff", value: `${sheetName}${sheetPosition ? ` (${sheetPosition})` : ""}` },
    // the person printing or exporting the list (the signed-in user)
    { label: "Printed by", value: own.name || session.fullName },
    { label: "Company", value: byCompany.map((b) => b.name).join(", ") || "-" },
    { label: "Period", value: monthLabel(month) },
    ...(sp.status ? [{ label: "Status", value: PETTY_CASH_PAYMENT_STATUS_LABEL[sp.status] ?? sp.status }] : []),
    { label: "Total claimed", value: formatRm(sum(shown)) },
    { label: "Paid", value: formatRm(sum(paid)) },
    { label: "Still pending", value: formatRm(sum(waiting)) },
  ];
  const sheetSignatures = [{ label: "Claimed by", name: sheetName }, { label: "Checked by" }, { label: "Approved by" }];
  const summary = spendSummary(spent, allCompanies, {
    totalLabel: "Total claimed (money spent)",
    after: [
      { label: "Paid", value: formatRm(sum(paid)) },
      { label: "Waiting for payment", value: formatRm(sum(waiting)), bold: true },
    ],
  });

  return (
    <SoftPage>
      <SoftHeader title="My Claims" subtitle={isOwn ? "Claim back what you bought for the company with your own money" : `The claims of ${staff}`} />
      <SpendingSubNav hideFinance={!hasFinance} hidePettyCash={!hasFinance && !access.isHolder} />

      {!isOwn ? null : companies.length === 0 ? (
        <EmptyRow text="Your staff record is not linked to your login yet. Please ask the HR admin to link it, then you can send your claims here." />
      ) : (
        <SectionCard title="New claim">
          <MyClaimForm companies={companies} payers={payerList} defaultCompanyId={isRestaurantOnly(allCompanies, resolveCompanyScope(session, allCompanies, sp.company).accessibleIds, sp.company) ? sp.company ?? allCompanies.find((c) => c.name === RESTAURANT_COMPANY_NAME)?.id : undefined} />
        </SectionCard>
      )}

      <ListFilters sortOptions={SORTS} sort={sort} dir={dir} clearHref="/spending/my-claims">
        {hasFinance && staffOptions.length > 0 && (
          <FilterField label="Staff (to list, print or export)">
            <Select name="staff" defaultValue={staff} className={`${FILTER_INPUT} w-64`}>
              <option value="">{`My own claims${own.name ? ` (${own.name})` : ""}`}</option>
              {staffOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </FilterField>
        )}
        <FilterField label="Month">
          <Select name="month" defaultValue={month} className={`${FILTER_INPUT} w-44`}>
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Description, category, invoice no. or remarks" className={`${FILTER_INPUT} w-60`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All statuses</option>
            {Object.entries(PETTY_CASH_PAYMENT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Total claimed", value: sum(shown), sub: `${shown.length} claim${shown.length === 1 ? "" : "s"} · ${monthLabel(month)}`, colour: "var(--color-danger)" },
          { label: "Paid", value: sum(paid), sub: `${paid.length} paid`, colour: "var(--color-success)" },
          { label: "Waiting for payment", value: sum(waiting), sub: `${waiting.length} waiting`, colour: "var(--color-warning, #b7791f)" },
        ].map((t) => (
          <div key={t.label} className="overflow-hidden rounded-2xl border border-border bg-surface text-center shadow-sm">
            <div className="h-1.5" style={{ background: t.colour }} />
            <div className="px-4 py-3.5">
              <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">{t.label}</div>
              <div className="mt-1 text-[24px] font-extrabold leading-tight tabular-nums" style={{ color: t.colour }}>{formatPrice(t.value)}</div>
              <div className="mt-0.5 text-[12px] text-text-secondary">{t.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {byCompany.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-text-secondary">
          <span>{`Spent by each company (${monthLabel(month)}):`}</span>
          {byCompany.map((b) => (
            <span key={b.name}>
              {b.name}: <strong className="text-text">{formatPrice(b.amount)}</strong>
            </span>
          ))}
        </div>
      )}

      <SectionCard
        title={isOwn ? "My claims" : `Claims of ${staff}`}
        action={
          <ExportListButtons
            filenameBase={`claims-${fileSlug(sheetName) || "staff"}-${month}`}
            title={`Staff Claims - ${sheetName}`}
            info={sheetInfo}
            signatures={sheetSignatures}
            headers={exportHeaders}
            rows={exportRows}
            moneyColumns={["Amount (RM)"]}
            summary={summary}
          />
        }
      >
        {shown.length === 0 ? (
          <EmptyRow text={all.length === 0 ? (isOwn ? "You have not sent any claims yet." : `${staff} has no claims yet.`) : "No claims match this month or search."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="text-[11.5px] font-semibold uppercase text-text-muted">
                  <th className="whitespace-nowrap px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="whitespace-nowrap px-3 py-2">Claim from</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Amount</th>
                  <th className="whitespace-nowrap px-3 py-2">Status</th>
                  <th className="whitespace-nowrap px-3 py-2">Receipt</th>
                  <th className="whitespace-nowrap px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const isPaid = c.payment_status === "paid";
                  return (
                    <tr key={c.id} className="border-t border-border align-top text-[13px]">
                      <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">{formatMalaysiaDate(c.transaction_date)}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-text">{c.description || "—"}</div>
                        {c.category && <div className="text-[11.5px] text-text-muted">{c.category}</div>}
                        {c.invoice_no && <div className="text-[11.5px] font-semibold text-text-secondary">{`Invoice No.: ${c.invoice_no}`}</div>}
                        <div className="text-[11.5px] text-text-muted">{companyLabel(c)}</div>
                        {c.remarks && <div className="text-[11.5px] text-text-secondary">{`Remarks: ${c.remarks}`}</div>}
                        {c.payment_method && <div className="text-[11.5px] text-text-secondary">{`${isOwn ? "You" : "Staff"} paid by: ${paymentMethodLabel(c.payment_method)}`}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">{short(c.person_name) || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-text">{formatPrice(Number(c.amount))}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <StatusBadge tone={isPaid ? "success" : "warning"}>
                          {isPaid ? "🟢 " : "🟡 "}
                          {PETTY_CASH_PAYMENT_STATUS_LABEL[c.payment_status] ?? c.payment_status}
                        </StatusBadge>
                        {isPaid && c.payment_date && <div className="mt-1 text-[11px] text-text-muted">{formatMalaysiaDate(c.payment_date)}</div>}
                        {isPaid && c.payment_reference && <div className="text-[11px] text-text-muted">{`Reference ID: ${c.payment_reference}`}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {receiptIds(c).length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {receiptIds(c).map((id, i, ids) => (
                              <DocumentViewLink key={id} documentId={id} label={ids.length > 1 ? `📷 View ${i + 1}` : "📷 View"} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {isOwn ? (
                        <MyClaimActions
                          claim={{ id: c.id, companyId: c.company_id, date: c.transaction_date, amount: String(c.amount), amountText: Number(c.amount).toFixed(2), payer: c.person_name ?? "", paymentMethod: c.payment_method ?? "", category: c.category ?? "", description: c.description ?? "", remarks: c.remarks ?? "", invoiceNo: c.invoice_no ?? "", autoCountInvoiceNo: c.autocount_invoice_no ?? "", hasReceipt: receiptIds(c).length > 0 }}
                          companies={companies}
                          payers={payerList}
                        />
                        ) : (
                          <span className="text-[12px] text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </SoftPage>
  );
}

/** The claims the signed-in person sent themselves (newest first). */
function readOwnClaims(admin: ReturnType<typeof createAdminClient>, userId: string) {
  return admin.from("petty_cash_transactions").select("*").eq("created_by", userId).eq("type", "expense").order("transaction_date", { ascending: false }).order("created_at", { ascending: false });
}

type ClaimRow = NonNullable<Awaited<ReturnType<typeof readOwnClaims>>["data"]>[number];
