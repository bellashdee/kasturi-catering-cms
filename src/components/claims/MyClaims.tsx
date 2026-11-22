"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { todayInMalaysia } from "@/lib/format";
import { uploadReceipt, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { deleteMyClaim, restoreMyClaim, submitMyClaim, updateMyClaim, type MyClaimInput } from "@/lib/finance/myClaims";
import type { PettyCashTransactionRow } from "@/lib/finance/actions";
import { PAYMENT_METHOD_LABEL, PETTY_CASH_CATEGORIES, joinCategories, splitCategories } from "@/lib/operationPettyCash/constants";
import { DescriptionInput } from "@/components/DescriptionInput";
import { Select } from "@/components/ui/Select";
import { MultiChoiceSelect } from "@/components/ui/MultiChoiceSelect";
import { SplitAmountBox, SplitChoice } from "@/components/shared/SplitAmountBox";
import { chosenCategories, splitAddsUp, splitCells } from "@/lib/categorySplit";
import { RecordActions } from "@/components/shared/RecordActions";
import { BTN_GHOST, Dialog } from "@/components/priority/ui";
import { CompanyChips } from "@/components/pettyCash/CompanyChips";
import { AutoCountInvoiceField } from "@/components/procurement/AutoCountInvoiceField";
import { useAllRestaurant } from "@/components/layout/RestaurantView";
import { INVOICE_NO_LABEL, INVOICE_NO_PLACEHOLDER, SPEND_GRID_2, SPEND_GRID_3, SPEND_HINT, SPEND_INPUT, SPEND_LABEL, SPEND_SAVE_BTN } from "@/components/spending/formStyles";

type Company = { id: string; name: string };
type Payer = { name: string; position: string };
export type ClaimValues = { companyId: string; date: string; amount: string; payer: string; paymentMethod: string; category: string; description: string; /** what it was for, e.g. the event */ remarks?: string; /** the invoice / receipt number as printed */ invoiceNo?: string; /** the event's AutoCount invoice no. (the cost then counts in that event's P&L) */ autoCountInvoiceNo?: string };

const inputClass = SPEND_INPUT;
const labelClass = SPEND_LABEL;

/** The fields of a claim: used to send a new claim and to change one that is not paid yet. */
function ClaimFields({
  companies,
  payers,
  initial,
  hasReceipt = false,
  multiCompany = false,
  submitLabel,
  onSubmit,
  onCancel,
  onSaved,
  clearAfter = false,
}: {
  companies: Company[];
  payers: Payer[];
  initial: ClaimValues;
  hasReceipt?: boolean;
  /** a new claim: one or more companies, the amount split between them (each part is its own claim) */
  multiCompany?: boolean;
  submitLabel: string;
  onSubmit: (input: MyClaimInput) => Promise<ActionResult>;
  onCancel?: () => void;
  onSaved: () => void;
  /** a new claim: the boxes are emptied after it is sent */
  clearAfter?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  // the receipts / photos (several can be chosen at once); on Edit they are added to the ones attached
  const [receipts, setReceipts] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ClaimValues>) => setV((p) => ({ ...p, ...patch }));
  // the companies the bill is for (a new claim can be for more than one)
  const [companyIds, setCompanyIds] = useState<string[]>(initial.companyId ? [initial.companyId] : []);
  const chosenCompanies = companies.filter((c) => companyIds.includes(c.id));
  const companyId = multiCompany ? (chosenCompanies[0]?.id ?? "") : v.companyId;
  // O2 Life is the restaurant: no events, so no AutoCount Invoice No.
  const noAutoCount = useAllRestaurant(multiCompany ? companyIds : [v.companyId]);
  // more than one company or category: the amount is split between them, each part is its own claim
  const [shareText, setShareText] = useState<Record<string, string>>({});
  // whether to split: between the companies, and by category (not split: one claim for all of them)
  const [splitCompaniesOn, setSplitCompaniesOn] = useState(true);
  const [splitCategoriesOn, setSplitCategoriesOn] = useState(true);
  const categoryList = chosenCategories(splitCategories(v.category));
  const canSplitCategories = categoryList.length > 1;
  const byCategory = canSplitCategories && splitCategoriesOn;
  const canSplitCompanies = multiCompany && chosenCompanies.length > 1;
  const byCompany = canSplitCompanies && splitCompaniesOn;
  const cells = splitCells(v.amount, byCategory ? categoryList : [], byCompany ? chosenCompanies.map((c) => c.id) : [], shareText);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!companyId) {
      setError("Choose the company the bill is for.");
      return;
    }
    if (!v.payer) {
      setError("Choose who you claim from: Penny Chan or Nabilah.");
      return;
    }
    if (!v.paymentMethod) {
      setError("Choose how you paid: cash or online transfer.");
      return;
    }
    if ((byCategory || byCompany) && (!splitAddsUp(v.amount, cells) || cells.some((c) => c.amount <= 0))) {
      setError("The parts must add up to the amount you paid, each more than 0.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of receipts) uploaded.push(await uploadReceipt(companyId, file));
      const documentId: string | undefined = uploaded[0];
      const extraDocumentIds = uploaded.slice(1);
      const result = await onSubmit({
        companyId,
        date: v.date,
        amount: Number(v.amount),
        payer: v.payer,
        paymentMethod: v.paymentMethod,
        category: v.category || undefined,
        description: v.description || undefined,
        remarks: v.remarks?.trim() || undefined,
        invoiceNo: v.invoiceNo?.trim() || undefined,
        autoCountInvoiceNo: noAutoCount ? "" : v.autoCountInvoiceNo?.trim() ?? "",
        documentId,
        extraDocumentIds,
        // split between companies (and categories): each part with its company; only categories: each part with its category
        shares: byCompany ? cells.map((c) => ({ companyId: c.companyId, amount: c.amount, ...(byCategory ? { category: c.category } : {}) })) : undefined,
        categoryShares: byCategory && !byCompany ? cells.map((c) => ({ category: c.category, amount: c.amount })) : undefined,
        // not split between the companies: the claim is for all the companies chosen (counted once)
        alsoCompanyIds: canSplitCompanies && !byCompany ? chosenCompanies.slice(1).map((c) => c.id) : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReceipts([]);
      form.reset();
      if (clearAfter) {
        setV(initial);
        setCompanyIds([]);
        setShareText({});
      }
      onSaved();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not send the claim."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      <div className={SPEND_GRID_3}>
        <div>
          <label className={labelClass}>{multiCompany ? "Company * (choose one or more)" : "Company *"}</label>
          {multiCompany ? (
            <CompanyChips companies={companies} value={companyIds} onChange={(ids) => { setCompanyIds(ids); setShareText({}); }} />
          ) : (
            <Select value={v.companyId} onChange={(e) => set({ companyId: e.target.value })} required className={inputClass}>
              <option value="">Select the company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
        </div>
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" required max={todayInMalaysia()} value={v.date} onChange={(e) => set({ date: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Amount you paid (RM) *</label>
          <input type="number" min="0.01" step="0.01" required value={v.amount} onChange={(e) => { set({ amount: e.target.value }); setShareText({}); }} className={inputClass} />
        </div>
      </div>
      <div className={SPEND_GRID_3}>
        <div>
          <label className={labelClass}>Paid by *</label>
          <Select value={v.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })} required className={inputClass}>
            <option value="">Select cash or online transfer</option>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Claim from *</label>
          <Select value={v.payer} onChange={(e) => set({ payer: e.target.value })} required className={inputClass}>
            <option value="">Select Penny Chan or Nabilah</option>
            {payers.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Category (choose one or more)</label>
          <MultiChoiceSelect options={PETTY_CASH_CATEGORIES} value={splitCategories(v.category)} onChange={(list) => set({ category: joinCategories(list) })} placeholder="Select category" searchPlaceholder="Search category" />
        </div>
      </div>
      <div className={SPEND_GRID_2}>
        <div>
          <label className={labelClass}>Description</label>
          <DescriptionInput value={v.description} onChange={(text) => set({ description: text })} companyId={v.companyId} className={inputClass} placeholder="e.g. Cooking gas for the Ahmad wedding" />
        </div>
        <div>
          <label className={labelClass}>{INVOICE_NO_LABEL}</label>
          <input value={v.invoiceNo ?? ""} onChange={(e) => set({ invoiceNo: e.target.value })} maxLength={100} placeholder={INVOICE_NO_PLACEHOLDER} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Remarks (optional)</label>
        <input value={v.remarks ?? ""} onChange={(e) => set({ remarks: e.target.value })} maxLength={500} placeholder="Anything else to note" className={inputClass} />
      </div>
      {!noAutoCount && <AutoCountInvoiceField value={v.autoCountInvoiceNo ?? ""} onChange={(text) => set({ autoCountInvoiceNo: text })} inputClassName={inputClass} labelClassName={labelClass} />}
      {canSplitCompanies && (
        <SplitChoice
          label="Split the amount between the companies"
          checked={splitCompaniesOn}
          onChange={(on) => { setSplitCompaniesOn(on); setShareText({}); }}
          on="Each company gets its own part of the amount."
          off="Not split: one claim for the whole amount, for all the chosen companies."
        />
      )}
      {canSplitCategories && (
        <SplitChoice
          label="Split the amount by category"
          checked={splitCategoriesOn}
          onChange={(on) => { setSplitCategoriesOn(on); setShareText({}); }}
          on="Each category gets its own part of the amount."
          off="Not split: one claim for the whole amount, under all the chosen categories."
        />
      )}
      {(byCategory || byCompany) && (
        <SplitAmountBox
          title={byCategory && byCompany ? "Split the amount by category and company (RM) *" : byCompany ? "Split the amount between the companies (RM) *" : "Split the amount by category (RM) *"}
          total={v.amount}
          cells={cells}
          companies={byCompany ? chosenCompanies : []}
          onType={(key, text) => setShareText((p) => ({ ...p, [key]: text }))}
          onEqual={() => setShareText({})}
        />
      )}
      <div>
        <label className={labelClass}>Receipt / photo</label>
        <input type="file" multiple accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setReceipts(Array.from(e.target.files ?? []))} className="mt-1 block w-full text-[13px]" />
        <p className={SPEND_HINT}>
          {receipts.length > 1 ? `${receipts.length} files chosen. ` : ""}
          {hasReceipt ? "A receipt is already attached. Files chosen here are added to it." : "You can choose several files at once (hold Ctrl to pick more than one)."}
        </p>
      </div>
      <div className="flex justify-end gap-2.5">
        {onCancel && (
          <button type="button" className={BTN_GHOST} disabled={saving} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={saving} className={SPEND_SAVE_BTN}>
          {saving ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** The form that sends a new claim. */
/** `defaultCompanyId`: the company already ticked (O2 Life, the restaurant, when it is the only company viewed). */
export function MyClaimForm({ companies, payers, defaultCompanyId }: { companies: Company[]; payers: Payer[]; defaultCompanyId?: string }) {
  return (
    <ClaimFields
      companies={companies}
      payers={payers}
      initial={{ companyId: defaultCompanyId && companies.some((c) => c.id === defaultCompanyId) ? defaultCompanyId : "", date: todayInMalaysia(), amount: "", payer: payers.length === 1 ? payers[0].name : "", paymentMethod: "", category: "", description: "", remarks: "", invoiceNo: "", autoCountInvoiceNo: "" }}
      multiCompany
      submitLabel="Send claim"
      onSubmit={submitMyClaim}
      onSaved={() => undefined}
      clearAfter
    />
  );
}

export type MyClaimEditData = ClaimValues & { id: string; amountText: string; hasReceipt: boolean };

/** Edit (Save / Cancel) and Delete (Undo) of a claim that is not paid yet. */
export function MyClaimActions({ claim, companies, payers }: { claim: MyClaimEditData; companies: Company[]; payers: Payer[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RecordActions<PettyCashTransactionRow>
        onEdit={() => setOpen(true)}
        onDelete={() => deleteMyClaim(claim.id)}
        onRestore={(row) => restoreMyClaim(row)}
        confirmText={`Delete this claim of RM ${claim.amountText}?`}
      />
      {open && (
        <Dialog title="Edit claim" onClose={() => setOpen(false)}>
          <ClaimFields
            companies={companies}
            payers={payers}
            initial={claim}
            hasReceipt={claim.hasReceipt}
            submitLabel="Save changes"
            onSubmit={(input) => updateMyClaim(claim.id, input)}
            onCancel={() => setOpen(false)}
            onSaved={() => setOpen(false)}
          />
        </Dialog>
      )}
    </>
  );
}

