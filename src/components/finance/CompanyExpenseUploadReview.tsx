"use client";

import { DOCUMENT_FILE_ACCEPT } from "@/lib/documents/upload";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDocumentUpload } from "@/lib/importFlow/useDocumentUpload";
import { ImportTabs, FileDropZone, ExtractionNotice, FormError, ConfirmActions } from "@/components/shared/import/ImportFlowAtoms";
import { createCompanyExpense } from "@/lib/finance/actions";
import { DEPARTMENT_OPTIONS } from "@/lib/finance/constants";
import { DescriptionInput } from "@/components/DescriptionInput";
import { Select } from "@/components/ui/Select";
import { MultiChoiceSelect } from "@/components/ui/MultiChoiceSelect";
import { SplitAmountBox, SplitChoice } from "@/components/shared/SplitAmountBox";
import { splitAddsUp, splitCells } from "@/lib/categorySplit";
import { AutoCountInvoiceField } from "@/components/procurement/AutoCountInvoiceField";
import { INVOICE_NO_LABEL, INVOICE_NO_PLACEHOLDER, SPEND_GRID_2, SPEND_INPUT, SPEND_LABEL } from "@/components/spending/formStyles";

type Company = { id: string; name: string };
type CostCategory = { id: string; name: string };
type UtilityAccount = { id: string; companyId: string; name: string; provider: string | null; accountNo: string | null };

type ExtractedExpense = {
  category?: string;
  description?: string;
  invoice_number?: string | null;
  amount?: number;
  expense_date?: string;
};

const inputClass = SPEND_INPUT;
const labelClass = SPEND_LABEL;

export function CompanyExpenseUploadReview({
  companies,
  defaultCompanyId,
  categories,
  utilityAccounts = [],
  redirectTo,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  categories: CostCategory[];
  utilityAccounts?: UtilityAccount[];
  redirectTo: string;
}) {
  const router = useRouter();
  const flow = useDocumentUpload();

  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [department, setDepartment] = useState("");
  const [accountId, setAccountId] = useState("");
  // marked as a Credit Note (money given back: counted as minus) or a Debit Note (an extra charge); none by default
  const [noteType, setNoteType] = useState<"credit_note" | "debit_note" | null>(null);
  // one or more categories: with more than one, the amount is split between them and each part is saved as its own expense
  // the category is never filled in by itself (not even from a receipt read by the AI): the person chooses it
  const [form, setForm] = useState<{ categories: string[]; description: string; invoiceNo: string; amount: string; expenseDate: string }>({ categories: [], description: "", invoiceNo: "", amount: "", expenseDate: "" });
  const [shareText, setShareText] = useState<Record<string, string>>({});
  // the event's AutoCount invoice no.: the cost then counts in that event's P&L
  const [autoCountNo, setAutoCountNo] = useState("");
  // more than one category: split the amount between them (each part its own expense) or keep one expense under all of them
  const [splitOn, setSplitOn] = useState(true);
  const byCategory = form.categories.length > 1 && splitOn;
  const cells = splitCells(form.amount, byCategory ? form.categories : [], [], shareText);

  const isUtilities = form.categories.some((c) => /utilit/i.test(c));
  const accountsOfCompany = utilityAccounts.filter((a) => a.companyId === companyId);
  const accountLabel = (a: UtilityAccount) => [a.provider, a.name, a.accountNo].filter(Boolean).join(" · ");

  /** Picking a utility account writes its supplier, branch and account number into the description. */
  function pickAccount(id: string) {
    setAccountId(id);
    const a = accountsOfCompany.find((x) => x.id === id);
    if (!a) return;
    const supplier = a.provider === "SAJ" ? "RANHILL SAJ SDN BHD" : (a.provider ?? "").toUpperCase();
    const tag = `${supplier ? `${supplier} · ` : ""}${a.name.toUpperCase()}${a.accountNo ? ` · ACC NO: ${a.accountNo}` : ""}`;
    setForm((f) => ({ ...f, description: tag }));
  }

  async function handleUploadAndExtract() {
    const extracted = (await flow.uploadAndExtract({ companyId, module: "finance", extractionKind: "company_expense" })) as ExtractedExpense | null;
    if (extracted) {
      setForm({
        categories: [],
        description: extracted.description ?? "",
        invoiceNo: typeof extracted.invoice_number === "string" ? extracted.invoice_number.trim() : "",
        amount: extracted.amount?.toString() ?? "",
        expenseDate: extracted.expense_date ?? "",
      });
    }
  }

  async function handleConfirm() {
    if (!form.amount || !form.expenseDate) {
      flow.setError("Enter the amount and the date.");
      return;
    }
    if (form.categories.length === 0) {
      flow.setError("Choose the category.");
      return;
    }
    if (byCategory && (!splitAddsUp(form.amount, cells) || cells.some((c) => c.amount <= 0))) {
      flow.setError("The category amounts must add up to the total, each more than 0.");
      return;
    }
    try {
      await flow.confirm(async () => {
        await createCompanyExpense({
          companyId,
          category: byCategory ? form.categories[0] : form.categories.join(" | "),
          categoryShares: byCategory ? cells.map((c) => ({ category: c.category, amount: c.amount })) : undefined,
          department: department || undefined,
          amount: Number(form.amount),
          expenseDate: form.expenseDate,
          notes: form.description || undefined,
          invoiceNo: form.invoiceNo.trim() || undefined,
          autoCountInvoiceNo: autoCountNo.trim(),
          documentId: flow.documentId || undefined,
          noteType,
        });
      });
      router.push(redirectTo);
      router.refresh();
    } catch {
      // error already surfaced by the hook
    }
  }

  return (
    <div>
      <ImportTabs tab={flow.tab} onSelect={flow.selectTab} pdfLabel="Upload File (PDF / Excel / CSV)" photoLabel="Photo / Screenshot" />

      <div className="p-6">
        <div className={`mb-4 ${SPEND_GRID_2}`}>
          <div>
            <label className={labelClass}>Company *</label>
            <Select
              required
              disabled={flow.documentId !== null}
              value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setAccountId(""); }}
              className={`${inputClass} disabled:bg-surface-alt disabled:text-text-muted`}
            >
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <label className={labelClass}>Department</label>
            <Select value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass}>
              <option value="">Select department (optional)</option>
              {DEPARTMENT_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
        </div>

        {flow.step === "pick" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <FileDropZone
              file={flow.file}
              accept={flow.tab === "pdf" ? DOCUMENT_FILE_ACCEPT : "image/*"}
              prompt={flow.tab === "pdf" ? "Click to choose the receipt or invoice (PDF, Excel or CSV)" : "Click to choose a photo or screenshot of the receipt"}
              onChange={flow.setFile}
            />
            <FormError error={flow.error} />
            <button onClick={handleUploadAndExtract} disabled={!flow.file || flow.uploading} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
              {flow.uploading ? "Reading the document..." : "Upload and read"}
            </button>
          </div>
        )}

        {flow.step === "review" && (
          <div className="flex flex-col gap-4">
            <ExtractionNotice notice={flow.notice} report={flow.report} />
            <FormError error={flow.error} />

            <div className={SPEND_GRID_2}>
              <div>
                <label className={labelClass}>Category * (choose one or more)</label>
                <div>
                  <MultiChoiceSelect options={categories.map((c) => c.name)} value={form.categories} onChange={(list) => { setForm((f) => ({ ...f, categories: list })); setShareText({}); }} placeholder="Select category" searchPlaceholder="Search category" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Date *</label>
                <input type="date" value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} className={inputClass} />
              </div>
            </div>

            {isUtilities && (
              <div>
                <label className={labelClass}>Utility account (branch and account no.)</label>
                <Select value={accountId} onChange={(e) => pickAccount(e.target.value)} className={inputClass}>
                  <option value="">Select the account (optional)</option>
                  {accountsOfCompany.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                </Select>
              </div>
            )}

            <div className={SPEND_GRID_2}>
              <div>
                <label className={labelClass}>Description</label>
                <DescriptionInput value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} companyId={companyId} className={inputClass} placeholder="e.g. TNB electricity bill, September" />
              </div>
              <div>
                <label className={labelClass}>{INVOICE_NO_LABEL}</label>
                <input value={form.invoiceNo} onChange={(e) => setForm((f) => ({ ...f, invoiceNo: e.target.value }))} maxLength={100} placeholder={INVOICE_NO_PLACEHOLDER} className={inputClass} />
              </div>
            </div>

            <AutoCountInvoiceField value={autoCountNo} onChange={setAutoCountNo} inputClassName={inputClass} labelClassName={labelClass} />

            <div className={SPEND_GRID_2}>
              <div>
                <label className={labelClass}>{byCategory ? "Total amount (RM) *" : "Amount (RM) *"}</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setShareText({}); }} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Mark (optional)</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {([
                    ["credit_note", "Credit Note", "Money given back: counted as a minus"],
                    ["debit_note", "Debit Note", "An extra charge"],
                  ] as const).map(([value, text, hint]) => (
                    <button
                      key={value}
                      type="button"
                      title={hint}
                      aria-pressed={noteType === value}
                      onClick={() => setNoteType(noteType === value ? null : value)}
                      className={`h-9 rounded-lg border px-3.5 text-[13px] font-semibold ${noteType === value ? (value === "credit_note" ? "border-success bg-success-bg text-success" : "border-warning bg-warning-bg text-warning") : "border-border-strong bg-surface text-text-secondary"}`}
                    >
                      {noteType === value ? "✓ " : ""}
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {form.categories.length > 1 && (
              <SplitChoice
                label="Split the amount by category"
                checked={splitOn}
                onChange={(on) => { setSplitOn(on); setShareText({}); }}
                on="Each category gets its own part of the amount."
                off="Not split: one expense for the whole amount, under all the chosen categories."
              />
            )}
            {byCategory && (
              <SplitAmountBox title="Split the amount by category (RM) *" total={form.amount} cells={cells} onType={(key, text) => setShareText((p) => ({ ...p, [key]: text }))} onEqual={() => setShareText({})} />
            )}

            <ConfirmActions onCancel={() => router.push(redirectTo)} onConfirm={handleConfirm} saving={flow.saving} label="Save expense" />
          </div>
        )}
      </div>
    </div>
  );
}
