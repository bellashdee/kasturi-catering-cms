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
import { SplitAmountBox } from "@/components/shared/SplitAmountBox";
import { splitAddsUp, splitCells } from "@/lib/categorySplit";

type Company = { id: string; name: string };
type CostCategory = { id: string; name: string };
type UtilityAccount = { id: string; companyId: string; name: string; provider: string | null; accountNo: string | null };



type ExtractedExpense = {
  category?: string;
  description?: string;
  amount?: number;
  expense_date?: string;
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

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
  // one or more categories: with more than one, the amount is split between them and each part is saved as its own expense
  // the category is never filled in by itself (not even from a receipt read by the AI): the person chooses it
  const [form, setForm] = useState<{ categories: string[]; description: string; amount: string; expenseDate: string }>({ categories: [], description: "", amount: "", expenseDate: "" });
  const [shareText, setShareText] = useState<Record<string, string>>({});
  const byCategory = form.categories.length > 1;
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
        amount: extracted.amount?.toString() ?? "",
        expenseDate: extracted.expense_date ?? "",
      });
    }
  }

  async function handleConfirm() {
    if (!form.amount || !form.expenseDate) {
      flow.setError("Amount and date are required.");
      return;
    }
    if (form.categories.length === 0) {
      flow.setError("Choose the category.");
      return;
    }
    if (byCategory && (!splitAddsUp(form.amount, cells) || cells.some((c) => c.amount <= 0))) {
      flow.setError("The amounts of the categories must add up to the total amount, each more than 0.");
      return;
    }
    try {
      await flow.confirm(async () => {
        await createCompanyExpense({
          companyId,
          category: form.categories[0],
          categoryShares: byCategory ? cells.map((c) => ({ category: c.category, amount: c.amount })) : undefined,
          department: department || undefined,
          amount: Number(form.amount),
          expenseDate: form.expenseDate,
          notes: form.description || undefined,
          documentId: flow.documentId || undefined,
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
        <div className="mb-4 grid grid-cols-2 gap-4">
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
              prompt={`Click to choose a ${flow.tab === "pdf" ? "PDF receipt" : "photo of the receipt"}`}
              onChange={flow.setFile}
            />
            <FormError error={flow.error} />
            <button onClick={handleUploadAndExtract} disabled={!flow.file || flow.uploading} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
              {flow.uploading ? "Uploading & reading document..." : "Upload & Extract"}
            </button>
          </div>
        )}

        {flow.step === "review" && (
          <div className="flex flex-col gap-4">
            <ExtractionNotice notice={flow.notice} report={flow.report} />
            <FormError error={flow.error} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Category * (choose one or more)</label>
                <div className="mt-1.5">
                  <MultiChoiceSelect options={categories.map((c) => c.name)} value={form.categories} onChange={(list) => { setForm((f) => ({ ...f, categories: list })); setShareText({}); }} placeholder="Select category" searchPlaceholder="Search category" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Expense Date *</label>
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

            <div>
              <label className={labelClass}>Description</label>
              <DescriptionInput value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} companyId={companyId} className={inputClass} placeholder="e.g. TNB electricity bill — September" />
            </div>

            <div>
              <label className={labelClass}>{byCategory ? "Total amount (RM) *" : "Amount (RM) *"}</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setShareText({}); }} className={inputClass} />
            </div>

            {byCategory && (
              <SplitAmountBox title="Split the amount by category (RM) *" total={form.amount} cells={cells} onType={(key, text) => setShareText((p) => ({ ...p, [key]: text }))} onEqual={() => setShareText({})} />
            )}

            <ConfirmActions onCancel={() => router.push(redirectTo)} onConfirm={handleConfirm} saving={flow.saving} />
          </div>
        )}
      </div>
    </div>
  );
}
