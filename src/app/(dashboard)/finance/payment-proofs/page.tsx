import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { INTAKE_COMPANIES } from "@/lib/catering/intake";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance/paymentProof";
import { formatMalaysiaDate, formatPrice, todayInMalaysia } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { CopyLink } from "@/components/driver/CopyLink";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { ReceiptPdfImport } from "@/components/finance/ReceiptPdfImport";
import { PaymentProofReviewRow, type InvoiceOption } from "@/components/finance/PaymentProofReviewRow";
import { ViewProofButton } from "@/components/finance/ViewProofButton";
import { MonthFilter } from "@/components/MonthFilter";
import { monthLabelOf, monthRange } from "@/lib/monthFilter";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

type InvoiceWithPayments = { id: string; invoice_number: string; company_id: string; amount: number; tax_amount: number | null; customers: { name: string } | null; customer_payments: { amount: number }[] };

const SORTS = { sent: "Date sent", paid: "Payment date", customer: "Customer", invoice: "Invoice No.", agent: "Sales agent", amount: "Amount" };

const outstandingOf = (i: { amount: number; tax_amount: number | null; customer_payments: { amount: number }[] }) =>
  Math.max(0, Number(i.amount) + Number(i.tax_amount ?? 0) - i.customer_payments.reduce((t, p) => t + Number(p.amount), 0));

export default async function PaymentProofsPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string; q?: string; sort?: string; dir?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const sp = await searchParams;
  const { company: requestedId, month } = sp;
  const { sort, dir } = readSort(sp, SORTS, "sent", "desc");
  const search = sp.q?.trim().toLowerCase() ?? "";
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  // the month is the day the customer paid (payment date), filtered in the query so the 200 limit never hides a month
  const range = monthRange(month);
  const monthLabel = monthLabelOf(month);
  let proofQuery = supabase
    .from("payment_proof_submissions")
    .select("*, companies(name), customer_invoices(id, invoice_number, amount, tax_amount, customers(name), customer_payments(amount))")
    .in("company_id", targetCompanyIds);
  if (range) proofQuery = proofQuery.gte("payment_date", range.start).lte("payment_date", range.end);

  const [{ data: rows }, { data: unpaid }] = await Promise.all([
    proofQuery.order("created_at", { ascending: false }).limit(200),
    supabase
      .from("customer_invoices")
      .select("id, invoice_number, company_id, amount, tax_amount, customers(name), customer_payments(amount)")
      .in("company_id", targetCompanyIds)
      .neq("status", "paid")
      .order("invoice_date", { ascending: false })
      .limit(500),
  ]);
  const customerOf = (p: { customer_invoices: unknown }) => (p.customer_invoices as { customers: { name: string } | null } | null)?.customers?.name ?? null;
  const proofs = sortBy(
    (rows ?? []).filter((p) => !search || [p.invoice_number, p.sales_agent, customerOf(p)].some((v) => (v ?? "").toLowerCase().includes(search))),
    sort,
    dir,
    {
      sent: (p) => p.created_at,
      paid: [(p) => p.payment_date, (p) => p.created_at],
      customer: [(p) => customerOf(p), (p) => p.invoice_number],
      invoice: (p) => p.invoice_number,
      agent: [(p) => p.sales_agent, (p) => p.created_at],
      amount: (p) => (p.amount === null ? null : Number(p.amount)),
    },
  );
  const pending = proofs.filter((p) => p.status === "pending");
  const reviewed = proofs.filter((p) => p.status !== "pending");
  const today = todayInMalaysia();
  const optionsFor = (companyId: string): InvoiceOption[] =>
    ((unpaid ?? []) as unknown as InvoiceWithPayments[])
      .filter((i) => i.company_id === companyId)
      .map((i) => ({ id: i.id, label: `${i.invoice_number}${i.customers?.name ? ` · ${i.customers.name}` : ""} · ${formatPrice(outstandingOf(i))} to pay`, outstanding: outstandingOf(i) }));
  const links = Object.entries(INTAKE_COMPANIES).filter(([, c]) => targetCompanyIds.includes(c.id));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Payments received from customers: the receipt listing from AutoCount (PDF), and the payment proofs sent by sales agents. Saving a receipt or approving a proof records the payment on the customer invoice.{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
      </div>
      <FinanceAdminSubNav />

      <ReceiptPdfImport companies={companies.filter((c) => targetCompanyIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name))} />

      <h2 className="mt-1 text-[16px] font-extrabold text-text">Payment proofs from sales agents</h2>

      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/finance/payment-proofs${query}`}>
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Invoice No., customer or sales agent" className={`${FILTER_INPUT} w-60`} />
        </FilterField>
      </ListFilters>

      {links.length > 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3 text-[14px] text-text-secondary shadow-sm">
          <b className="text-text">Link for sales agents (no login needed):</b>
          <p className="mt-0.5 text-[12.5px]">Press Copy link, then paste it in WhatsApp for the sales agent.</p>
          <div className="mt-2 flex flex-col gap-2">
            {links.map(([slug, c]) => (
              <CopyLink key={slug} path={`/payment-proof-form/${slug}`} label={c.name} />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3 text-[14px] font-bold text-text">Waiting for review ({pending.length})</div>
        {pending.length === 0 ? (
          <EmptyRow text={search ? "No payment proof waiting for review matches this search." : monthLabel ? "No payment proof waiting for review in this month." : "Nothing waiting for review."} />
        ) : (
          <div className="divide-y divide-border">
            {pending.map((p) => {
              const matched = p.customer_invoices as unknown as { id: string; invoice_number: string; amount: number; tax_amount: number | null; customers: { name: string } | null; customer_payments: { amount: number }[] } | null;
              const options = optionsFor(p.company_id);
              return (
                <div key={p.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-bold text-text">Invoice {p.invoice_number}</span>
                    {matched ? <StatusBadge tone="success">Invoice found{matched.customers?.name ? ` · ${matched.customers.name}` : ""}</StatusBadge> : <StatusBadge tone="warning">Invoice number not found — choose it below</StatusBadge>}
                    {companies.length > 1 && <span className="text-[12.5px] text-text-secondary">{p.companies?.name}</span>}
                  </div>
                  <div className="mt-1 text-[14px] text-text-secondary">
                    Paid {formatMalaysiaDate(`${p.payment_date}T12:00:00+08:00`)} · {PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}
                    {p.amount !== null ? ` · ${formatPrice(Number(p.amount))}` : ""}
                    {p.reference ? ` · Ref ${p.reference}` : ""}
                    {` · sent by ${p.sales_agent} on ${formatMalaysiaDate(p.created_at)}`}
                  </div>
                  {p.remarks && <div className="mt-0.5 whitespace-pre-line text-[13.5px] text-text-secondary">Remarks: {p.remarks}</div>}
                  <PaymentProofReviewRow
                    proofId={p.id}
                    matchedInvoiceId={matched?.id ?? null}
                    hasProof={!!p.proof_path}
                    options={options}
                    defaultAmount={p.amount !== null ? Number(p.amount) : matched ? outstandingOf(matched) : null}
                    defaultDate={p.payment_date}
                    today={today}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {reviewed.length > 0 && (
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3 text-[14px] font-bold text-text">Reviewed ({reviewed.length})</div>
          <div className="divide-y divide-border">
            {reviewed.map((p) => {
              const inv = p.customer_invoices as unknown as { id: string; invoice_number: string } | null;
              return (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[14px]">
                  <div>
                    <span className="font-semibold text-text">Invoice {p.invoice_number}</span>
                    <span className="ml-2 text-[13px] text-text-secondary">{p.sales_agent} · {formatMalaysiaDate(p.created_at)}{p.review_note ? ` · ${p.review_note}` : ""}</span>
                    <div className="text-[12.5px] text-text-secondary">
                      Paid {formatMalaysiaDate(`${p.payment_date}T12:00:00+08:00`)} · {PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}
                      {p.amount !== null ? ` · ${formatPrice(Number(p.amount))}` : ""}
                      {p.reference ? ` · Ref ${p.reference}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.proof_path ? <ViewProofButton proofId={p.id} /> : <span className="text-[12.5px] text-text-muted">No proof file</span>}
                    {inv && <Link href={`/finance/invoices/${inv.id}${query}`} className="text-[13px] font-semibold text-primary">Open invoice</Link>}
                    <StatusBadge tone={p.status === "approved" ? "success" : "neutral"}>{p.status === "approved" ? "Approved" : "Rejected"}</StatusBadge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
