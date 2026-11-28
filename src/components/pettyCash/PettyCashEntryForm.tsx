"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadReceipt, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { errorMessage } from "@/lib/actionResult";
import { isNetworkError, queueChange, shouldQueue } from "@/lib/offline/sync";
import { todayInMalaysia } from "@/lib/format";
import { createPettyCashEntry, updatePettyCashEntry } from "@/lib/operationPettyCash/actions";
import { createPettyCashTransaction, createSplitPettyCashClaims, markPettyCashPaid } from "@/lib/finance/actions";
import { PAYMENT_METHOD_LABEL, PETTY_CASH_CATEGORIES, joinCategories, splitCategories, type OperationPettyCashRow } from "@/lib/operationPettyCash/constants";
import { DescriptionInput } from "@/components/DescriptionInput";
import { SearchSelect } from "@/components/ui/SearchSelect";
import type { PersonOption } from "@/lib/pettyCash/people";
import { Select } from "@/components/ui/Select";
import { CompanyChips } from "@/components/pettyCash/CompanyChips";
import { MultiChoiceSelect } from "@/components/ui/MultiChoiceSelect";
import { splitCompanies } from "@/lib/pettyCash/companies";
import { chosenCategories, splitAddsUp, splitCells } from "@/lib/categorySplit";
import { SplitAmountBox, SplitChoice } from "@/components/shared/SplitAmountBox";
import { AutoCountInvoiceField } from "@/components/procurement/AutoCountInvoiceField";
import { useAllRestaurant } from "@/components/layout/RestaurantView";
import { INVOICE_NO_LABEL, INVOICE_NO_PLACEHOLDER, SPEND_CANCEL_BTN, SPEND_GRID_2, SPEND_HINT, SPEND_INPUT, SPEND_LABEL, SPEND_SAVE_BTN } from "@/components/spending/formStyles";

type Company = { id: string; name: string };
type EntryKind = "expense" | "top_up" | "claim" | "claim_payment";

/** a staff claim that is still waiting to be paid (for the Staff claim payment) */
export type PendingClaim = { id: string; label: string; claimant: string; amount: number; date: string; description: string; companyName: string };

const inputClass = SPEND_INPUT;
const labelClass = SPEND_LABEL;

/** What each Type is for, written for the person who fills the form (the Staff claim payment is shown only to the people who pay the claims). */
function UsageGuide({ canPay, hasClaim }: { canPay: boolean; hasClaim: boolean }) {
  return (
    <details className="rounded-lg border border-border bg-surface-alt">
      <summary className="cursor-pointer px-3 py-2 text-[13px] font-bold text-text">How to use this form (press to open)</summary>
      <ul className="flex flex-col gap-2 border-t border-border px-4 py-3 text-[12.5px] text-text-secondary">
        <li>
          <strong className="text-text">Received</strong>: money put into the petty cash, for example the float from Ms. Penny. Choose the company (or more than one), the date, the amount, and whether it came by cash or online transfer.
        </li>
        <li>
          <strong className="text-text">Spent</strong>: money paid out of the petty cash. Choose the category (with more than one, the amount can be split so each part is its own record), how it was paid, what was bought and the invoice no. if there is one, then attach the receipt.
        </li>
        {hasClaim && (
          <li>
            <strong className="text-text">Staff claim</strong>:{" "}
            {canPay
              ? "a staff member paid with their own money and now claims it back. Choose the staff name, and under Claim from choose Penny Chan or Nabilah, who will pay it. Staff can also send their own claims in My Claims."
              : "for staff who paid with their own money. Send it in My Claims (under Company Spending) and choose Penny Chan or Nabilah to pay you back."}
          </li>
        )}
        {canPay && (
          <li>
            <strong className="text-text">Staff claim payment</strong>: when Penny Chan or Nabilah has paid a staff claim, choose the claim, then enter the payment date, how it was paid and the reference ID. The staff name, amount and date of the claim are shown.
          </li>
        )}
        <li>
          <strong className="text-text">More than one company</strong>: choose every company the money is for. Spending and staff claims can be split, so each company keeps its own part; otherwise it is one record for all of them.
        </li>
      </ul>
    </details>
  );
}

/**
 * One form for the petty cash: money received, money spent (with the receipt) or a staff claim that still has to be paid. It always
 * belongs to one person's petty cash (the name chosen at the top). Also used to edit a cash book entry.
 */
export function PettyCashEntryForm({
  companies,
  defaultCompanyId,
  editing,
  listHref,
  people,
  holders,
  claimPayers = [],
  holderName,
  allowBook,
  allowClaim,
  allowPayClaims = false,
  pendingClaims = [],
  lockName = false,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  editing?: OperationPettyCashRow;
  listHref: string;
  people: PersonOption[];
  /** the people who hold a petty cash */
  holders: PersonOption[];
  /** the people a staff claim is claimed from (Ms. Penny and Ms. Nabilah) */
  claimPayers?: { name: string; position: string }[];
  holderName: string;
  /** may record money received / spent (the cash book) */
  allowBook: boolean;
  /** may record a staff claim */
  allowClaim: boolean;
  /** may record the payment of a staff claim (only the Director of Finance and her assistant) */
  allowPayClaims?: boolean;
  pendingClaims?: PendingClaim[];
  /** the person sees only their own petty cash: the name is theirs and cannot be changed */
  lockName?: boolean;
}) {
  const router = useRouter();
  // Received, Spent, Claimant; and the Staff claim payment for the Director of Finance and her assistant
  const kinds: EntryKind[] = [...(allowBook ? (["top_up", "expense"] as const) : []), ...(allowClaim ? (["claim"] as const) : []), ...(allowPayClaims && !editing ? (["claim_payment"] as const) : [])];
  // a new entry can be for more than one company (for example the float given for both): it is keyed in once, with one amount, and counted once
  const [companyIds, setCompanyIds] = useState<string[]>(editing ? [editing.company_id, ...(editing.shared_company_ids ?? [])] : [defaultCompanyId ?? companies[0]?.id ?? ""].filter(Boolean));
  const [kind, setKind] = useState<EntryKind>(editing?.entry_type ?? (kinds.includes("expense") ? "expense" : (kinds[0] ?? "expense")));
  const [payClaimId, setPayClaimId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayInMalaysia());
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [date, setDate] = useState(editing?.entry_date ?? todayInMalaysia());
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [paymentMethod, setPaymentMethod] = useState(editing?.payment_method ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  // what it was for, e.g. the event the things were bought for
  const [remarks, setRemarks] = useState(editing?.remarks ?? "");
  // the invoice / receipt number as printed (optional; not asked for money received)
  const [invoiceNo, setInvoiceNo] = useState(editing?.invoice_no ?? "");
  const [autoCountNo, setAutoCountNo] = useState(editing?.autocount_invoice_no ?? "");
  const [personName, setPersonName] = useState(editing?.person_name ?? holderName);
  // the amount split between the categories (and the companies of a claim): what was typed for each part; empty = shared equally
  const [shareText, setShareText] = useState<Record<string, string>>({});
  // a claim for more than one company: split the amount between them (each company keeps its own part) or keep it as one claim for all
  const [splitBetweenCompanies, setSplitBetweenCompanies] = useState(true);
  // more than one category: split the amount by category (each part its own record) or keep one record with all the categories
  const [splitByCategories, setSplitByCategories] = useState(true);
  const [claimant, setClaimant] = useState("");
  const [department, setDepartment] = useState("");
  // the receipts / photos (several can be chosen at once)
  const [receipts, setReceipts] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the id of a new single entry, made once: sent again (no connection, then the offline queue) it is never saved twice
  const newId = useRef<string | null>(null);
  const [keptOffline, setKeptOffline] = useState(false);

  const chosenCompanies = companies.filter((c) => companyIds.includes(c.id));
  const { companyId: firstCompanyId, alsoCompanyIds } = splitCompanies(chosenCompanies.map((c) => c.id), editing?.company_id);
  // O2 Life is the restaurant: no events, so no AutoCount Invoice No.
  const noAutoCount = useAllRestaurant(chosenCompanies.map((c) => c.id));
  const isClaim = kind === "claim";
  const isReceived = kind === "top_up";
  // more than one category: the amount is split between them, each part saved as its own record (money received has no category)
  const categoryList = isReceived ? [] : chosenCategories(splitCategories(category));
  const canSplitCategories = categoryList.length > 1;
  const byCategory = canSplitCategories && splitByCategories;
  // a new claim or spending for more than one company: split between the companies (each keeps its own part) or one record for all
  const canSplitCompanies = (isClaim || kind === "expense") && !editing && chosenCompanies.length > 1;
  const splitByCompany = canSplitCompanies && splitBetweenCompanies;
  const splitClaim = isClaim && !editing && (splitByCompany || byCategory);
  const showSplit = splitClaim || (!isClaim && (byCategory || splitByCompany));
  const cells = splitCells(amount, byCategory ? categoryList : [], splitByCompany ? chosenCompanies.map((c) => c.id) : [], shareText);
  const isPayment = kind === "claim_payment";
  const paidClaim = pendingClaims.find((c) => c.id === payClaimId);
  const isPayer = (name: string) => claimPayers.some((p) => p.name === name);
  // a staff claim is claimed from Ms. Penny or Ms. Nabilah; leaving the claim, the person of the page comes back
  const changeKind = (next: EntryKind) => {
    const was = kind;
    setKind(next);
    if (lockName) return;
    if (next === "claim") {
      if (!isPayer(personName)) {
        const only = claimPayers.length === 1 ? claimPayers[0] : undefined;
        setPersonName(only?.name ?? "");
      }
    } else if (was === "claim") {
      setPersonName(holderName);
    }
  };
  const pickPayer = (name: string) => setPersonName(name);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPayment) {
      if (!payClaimId) {
        setError("Choose the staff claim that was paid.");
        return;
      }
      if (!paymentMethod) {
        setError("Choose how the claim was paid: cash or online transfer.");
        return;
      }
      if (!paymentReference.trim()) {
        setError("Enter the payment reference ID.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await markPettyCashPaid({ transactionId: payClaimId, paymentDate, paymentMethod, paymentReference: paymentReference.trim(), paymentRemarks: paymentRemarks.trim() || undefined });
        setPayClaimId("");
        setPaymentMethod("");
        setPaymentReference("");
        setPaymentRemarks("");
        router.refresh();
      } catch (err) {
        setError(errorMessage(err, "Could not save."));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (isClaim && !lockName && !isPayer(personName)) {
      setError("Choose who the claim is claimed from: Penny Chan or Nabilah.");
      return;
    }
    if (!personName.trim()) {
      setError("Choose whose petty cash this is.");
      return;
    }
    if (isClaim && !claimant.trim()) {
      setError("Enter the name of the staff member who is claiming.");
      return;
    }
    if (showSplit && !splitAddsUp(amount, cells)) {
      setError(byCategory ? "The category amounts must add up to the total." : "The company amounts must add up to the total.");
      return;
    }
    if (showSplit && cells.some((c) => c.amount <= 0)) {
      setError("Enter an amount more than 0 for each part.");
      return;
    }
    const categoryShares = byCategory && !isClaim && !splitByCompany ? cells.map((c) => ({ category: c.category, amount: c.amount })) : undefined;
    const companyShares = splitByCompany && !isClaim ? cells.map((c) => ({ companyId: c.companyId, amount: c.amount, ...(byCategory ? { category: c.category } : {}) })) : undefined;
    if (!paymentMethod) {
      setError(isReceived ? "Choose how the money was received: cash or online transfer." : "Choose how it was paid: cash or online transfer.");
      return;
    }
    const invoice = isReceived ? undefined : invoiceNo.trim() || undefined;
    // the event's AutoCount invoice no.: the cost then counts in that event's P&L (money received has none)
    const autoCountInvoiceNo = isReceived ? undefined : noAutoCount ? "" : autoCountNo.trim();
    // one new Received / Spent entry (not split, not a claim) can be kept on this device without a connection
    const offlineOk = !isClaim && !editing && !categoryShares && !companyShares;
    newId.current ??= crypto.randomUUID();
    const resetAfterSave = () => {
      setAmount("");
      setPaymentMethod("");
      setCategory("");
      setDescription("");
      setRemarks("");
      setInvoiceNo("");
      setClaimant("");
      setShareText({});
      setDepartment("");
      setPersonName(holderName);
      setReceipts([]);
      newId.current = null;
      (e.target as HTMLFormElement).reset();
    };
    const uploaded: string[] = [];
    const keepOffline = async () => {
      await queueChange({
        op: "opPettyCash.create",
        recordId: newId.current!,
        companyId: firstCompanyId,
        payload: {
          companyId: firstCompanyId,
          alsoCompanyIds,
          paymentMethod,
          entryType: kind,
          entryDate: date,
          category: category || undefined,
          description: description || undefined,
          remarks: remarks.trim() || undefined,
          invoiceNo: invoice,
          autoCountInvoiceNo,
          amount: Number(amount),
          personName: personName || undefined,
          // receipts already uploaded before the connection dropped are reused; the others are uploaded later
          documentId: uploaded[0],
          extraDocumentIds: uploaded.slice(1),
        },
        label: { title: isReceived ? "Petty cash: money received" : "Petty cash: money spent", detail: `RM ${Number(amount).toFixed(2)} · ${date}${description ? ` · ${description}` : ""}` },
        files: uploaded.length === 0 && receipts.length > 0 ? [{ field: "documentId", files: receipts.slice(0, 1), companyId: firstCompanyId }, { field: "extraDocumentIds", files: receipts.slice(1), companyId: firstCompanyId, list: true }] : undefined,
      });
      resetAfterSave();
      setKeptOffline(true);
    };
    if (shouldQueue()) {
      if (!offlineOk) {
        setError("No connection. Without a connection only one new Received or Spent entry (not split) can be kept on this device.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await keepOffline();
      } catch (err) {
        setError(errorMessage(err, "Could not keep the entry on this device."));
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    setError(null);
    setKeptOffline(false);
    try {
      for (const file of receipts) uploaded.push(await uploadReceipt(firstCompanyId, file));
      const documentId: string | undefined = uploaded[0];
      const extraDocumentIds = uploaded.slice(1);
      const result = splitClaim
        ? await createSplitPettyCashClaims({
            claimantName: claimant.trim(),
            claimantDepartment: department.trim() || undefined,
            category: category || undefined,
            description: description || undefined,
            remarks: remarks.trim() || undefined,
            invoiceNo: invoice,
            autoCountInvoiceNo,
            transactionDate: date,
            documentId,
            extraDocumentIds,
            personName: personName.trim(),
            paymentMethod,
            shares: cells.map((c) => ({ companyId: c.companyId || firstCompanyId, amount: c.amount, ...(byCategory ? { category: c.category } : {}) })),
            // not split between the companies: every part is for all the companies chosen (counted once)
            alsoCompanyIds: splitByCompany ? undefined : alsoCompanyIds,
          })
        : isClaim
        ? await createPettyCashTransaction({
            companyId: firstCompanyId,
            alsoCompanyIds,
            type: "expense",
            claimantName: claimant.trim(),
            claimantDepartment: department.trim() || undefined,
            category: category || undefined,
            description: description || undefined,
            remarks: remarks.trim() || undefined,
            invoiceNo: invoice,
            autoCountInvoiceNo,
            amount: Number(amount),
            transactionDate: date,
            documentId,
            extraDocumentIds,
            personName: personName.trim(),
            paymentMethod,
          })
        : editing
          ? await updatePettyCashEntry(editing.id, { companyId: firstCompanyId, alsoCompanyIds, paymentMethod, categoryShares, entryType: kind as "expense" | "top_up", entryDate: date, category: category || undefined, description: description || undefined, remarks: remarks.trim() || undefined, invoiceNo: invoice, autoCountInvoiceNo, amount: Number(amount), documentId, extraDocumentIds, personName: personName || undefined })
          : await createPettyCashEntry({ id: newId.current ?? undefined, companyId: firstCompanyId, alsoCompanyIds, paymentMethod, categoryShares, shares: companyShares, entryType: kind as "expense" | "top_up", entryDate: date, category: category || undefined, description: description || undefined, remarks: remarks.trim() || undefined, invoiceNo: invoice, autoCountInvoiceNo, amount: Number(amount), documentId, extraDocumentIds, personName: personName || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (editing) {
        router.push(listHref);
      } else {
        resetAfterSave();
      }
      router.refresh();
    } catch (err) {
      if (offlineOk && isNetworkError(err)) {
        try {
          // only some receipts were uploaded: all of them go with the queue and are uploaded again from this device
          if (uploaded.length > 0 && uploaded.length < receipts.length) uploaded.length = 0;
          await keepOffline();
          return;
        } catch (queueErr) {
          setError(errorMessage(queueErr, "Could not keep the entry on this device."));
          return;
        }
      }
      setError(errorMessage(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  if (kinds.length === 0) return null;

  // cash or online transfer, asked for every type: how the money was received, spent, paid by the staff member or paid back to them
  const methodLabel = isReceived ? "Payment received by *" : isClaim ? "Staff paid by *" : isPayment ? "Claim paid by *" : "Paid by *";
  const methodField = (
    <div>
      <label className={labelClass}>{methodLabel}</label>
      <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} required className={inputClass}>
        <option value="">Select cash or online transfer</option>
        {Object.entries(PAYMENT_METHOD_LABEL).map(([value, text]) => (
          <option key={value} value={value}>{text}</option>
        ))}
      </Select>
    </div>
  );

  const typeField = (
    <div>
      <label className={labelClass}>Type *</label>
      <Select value={kind} disabled={!!editing} onChange={(e) => changeKind(e.target.value as EntryKind)} className={inputClass}>
        {kinds.includes("top_up") && <option value="top_up">Received</option>}
        {kinds.includes("expense") && <option value="expense">Spent</option>}
        {kinds.includes("claim") && <option value="claim">Staff claim</option>}
        {kinds.includes("claim_payment") && <option value="claim_payment">Staff claim payment</option>}
      </Select>
    </div>
  );

  if (isPayment) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="text-[15px] font-bold text-text">New entry</div>
        <UsageGuide canPay hasClaim={kinds.includes("claim")} />
        {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {typeField}
          <div className="sm:col-span-3">
            <label className={labelClass}>Staff claim that was paid *</label>
            <Select value={payClaimId} onChange={(e) => setPayClaimId(e.target.value)} required className={inputClass}>
              <option value="">{pendingClaims.length === 0 ? "No staff claims are waiting for payment" : "Select the staff claim"}</option>
              {pendingClaims.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </div>
        </div>
        {paidClaim && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-alt p-3 sm:grid-cols-4">
            <div>
              <div className={labelClass}>Staff name</div>
              <div className="mt-1 text-[13.5px] font-bold text-text">{paidClaim.claimant}</div>
            </div>
            <div>
              <div className={labelClass}>Amount</div>
              <div className="mt-1 text-[13.5px] font-bold text-text">{`RM ${paidClaim.amount.toFixed(2)}`}</div>
            </div>
            <div>
              <div className={labelClass}>Claim date</div>
              <div className="mt-1 text-[13.5px] font-bold text-text">{paidClaim.date}</div>
            </div>
            <div>
              <div className={labelClass}>Description</div>
              <div className="mt-1 text-[13.5px] text-text">{paidClaim.description}</div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelClass}>Payment date *</label>
            <input type="date" required max={todayInMalaysia()} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
          </div>
          {methodField}
          <div>
            <label className={labelClass}>Reference ID *</label>
            <input required value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="e.g. transfer reference, or CASH" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Remarks (optional)</label>
            <input value={paymentRemarks} onChange={(e) => setPaymentRemarks(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={saving || !payClaimId} className={SPEND_SAVE_BTN}>
            {saving ? "Saving..." : "Save payment"}
          </button>
        </div>
      </form>
    );
  }


  // a claim is claimed from Penny Chan or Nabilah and is sent by the staff themselves in My Claims: the others are pointed there
  if (isClaim && lockName) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="text-[15px] font-bold text-text">New entry</div>
        <UsageGuide canPay={allowPayClaims} hasClaim />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">{typeField}</div>
        <div className="rounded-lg border border-border bg-surface-alt p-4 text-[13px] text-text-secondary">
          <div className="font-bold text-text">Staff claims are sent in My Claims</div>
          <p className="mt-1">If you paid with your own money, send your claim in My Claims: choose Penny Chan or Nabilah to pay you back, attach the receipt, and follow it until it is paid.</p>
          <Link href="/spending/my-claims" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-white">
            Open My Claims
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="text-[15px] font-bold text-text">{editing ? "Edit entry" : "New entry"}</div>
      {!editing && <UsageGuide canPay={allowPayClaims} hasClaim={kinds.includes("claim")} />}
      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      {keptOffline && <div role="status" className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs font-semibold text-warning">No connection: the entry is kept on this device and saved when the connection is back (see the sync status at the top).</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-4">
          <label className={labelClass}>Company * (choose one or more)</label>
          <CompanyChips companies={companies} value={companyIds} onChange={setCompanyIds} />
        </div>
        {typeField}
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" required max={todayInMalaysia()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{showSplit ? "Total amount (RM) *" : "Amount (RM) *"}</label>
          <input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => { setAmount(e.target.value); setShareText({}); }} className={inputClass} />
        </div>
        {methodField}
      </div>

      <div className={SPEND_GRID_2}>
        <div>
          <label className={labelClass}>{isReceived ? "Received by *" : isClaim ? "Claim from *" : "Spent by *"}</label>
          {lockName ? (
            <input value={personName} readOnly className={`${inputClass} cursor-not-allowed bg-surface-alt`} />
          ) : isClaim ? (
            <Select value={personName} onChange={(e) => pickPayer(e.target.value)} required className={inputClass}>
              <option value="">Select Penny Chan or Nabilah</option>
              {claimPayers.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </Select>
          ) : (
            <SearchSelect value={personName} onChange={setPersonName} options={holders.map((p) => p.name)} className={inputClass} placeholder="Search or type a name" />
          )}
        </div>
      </div>

      {isClaim && (
        <div className={SPEND_GRID_2}>
          <div>
            <label className={labelClass}>Staff member claiming *</label>
            <SearchSelect
              value={claimant}
              onChange={setClaimant}
              options={people.filter((p) => p.local).map((p) => p.name)}
              onPick={(name) => {
                // the department of the person is filled in (it can still be changed)
                const found = people.find((p) => p.name === name);
                if (found?.department) setDepartment(found.department);
              }}
              className={inputClass}
              placeholder="Search or type the staff member's name"
            />
          </div>
          <div>
            <label className={labelClass}>Department</label>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Kitchen, Sales" className={inputClass} />
          </div>
        </div>
      )}

      <div className={SPEND_GRID_2}>
        {!isReceived && (
          <div>
            <label className={labelClass}>Category (choose one or more)</label>
            <MultiChoiceSelect options={PETTY_CASH_CATEGORIES} value={splitCategories(category)} onChange={(list) => setCategory(joinCategories(list))} placeholder="Select category" searchPlaceholder="Search category" />
          </div>
        )}
        <div className={isReceived ? "sm:col-span-2" : ""}>
          <label className={labelClass}>Description</label>
          <DescriptionInput value={description} onChange={setDescription} companyId={firstCompanyId} className={inputClass} placeholder={isReceived ? "e.g. Float from Ms. Penny" : "e.g. Petrol for event delivery"} />
        </div>
      </div>

      <div className={SPEND_GRID_2}>
        {!isReceived && (
          <div>
            <label className={labelClass}>{INVOICE_NO_LABEL}</label>
            <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} maxLength={100} placeholder={INVOICE_NO_PLACEHOLDER} className={inputClass} />
          </div>
        )}
        <div className={isReceived ? "sm:col-span-2" : ""}>
          <label className={labelClass}>Remarks (optional)</label>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} placeholder="Anything else to note" className={inputClass} />
        </div>
      </div>

      {!isReceived && !noAutoCount && <AutoCountInvoiceField value={autoCountNo} onChange={setAutoCountNo} inputClassName={inputClass} labelClassName={labelClass} />}

      {canSplitCompanies && (
        <SplitChoice
          label="Split the amount between the companies"
          checked={splitBetweenCompanies}
          onChange={(on) => { setSplitBetweenCompanies(on); setShareText({}); }}
          on="Each company gets its own part of the amount."
          off="Not split: one record for the whole amount, for all the chosen companies."
        />
      )}
      {canSplitCategories && (
        <SplitChoice
          label="Split the amount by category"
          checked={splitByCategories}
          onChange={(on) => { setSplitByCategories(on); setShareText({}); }}
          on="Each category gets its own part of the amount."
          off="Not split: one record for the whole amount, under all the chosen categories."
        />
      )}

      {showSplit && (
        <SplitAmountBox
          title={byCategory && splitByCompany ? "Split the amount by category and company (RM) *" : byCategory ? "Split the amount by category (RM) *" : "Split the amount between the companies (RM) *"}
          total={amount}
          cells={cells}
          companies={splitByCompany ? chosenCompanies : []}
          onType={(key, text) => setShareText((p) => ({ ...p, [key]: text }))}
          onEqual={() => setShareText({})}
        />
      )}

      <div>
        <label className={labelClass}>Receipt / photo{isReceived ? " (optional)" : ""}</label>
        <input type="file" multiple accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setReceipts(Array.from(e.target.files ?? []))} className="mt-1 block w-full text-[13px]" />
        <p className={SPEND_HINT}>
          {receipts.length > 1 ? `${receipts.length} files chosen. ` : ""}
          {editing && (editing.document_id || (editing.extra_document_ids ?? []).length > 0)
            ? `Receipts already attached: ${(editing.document_id ? 1 : 0) + (editing.extra_document_ids ?? []).length}. Files chosen here are added to them.`
            : "You can choose several files at once (hold Ctrl to pick more than one)."}
        </p>
      </div>

      <div className="flex justify-end gap-2.5">
        {editing && (
          <Link href={listHref} className={SPEND_CANCEL_BTN}>
            Cancel
          </Link>
        )}
        <button type="submit" disabled={saving} className={SPEND_SAVE_BTN}>
          {saving ? "Saving..." : editing ? "Save changes" : isClaim ? "Save claim" : isReceived ? "Save money received" : "Save spending"}
        </button>
      </div>
    </form>
  );
}
