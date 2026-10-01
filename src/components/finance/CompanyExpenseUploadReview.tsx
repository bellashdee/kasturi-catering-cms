"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDocumentUpload } from "@/lib/importFlow/useDocumentUpload";
import { ImportTabs, FileDropZone, ExtractionNotice, FormError, ConfirmActions } from "@/components/shared/import/ImportFlowAtoms";
import { createCompanyExpense } from "@/lib/finance/actions";

type Company = { id: string; name: string };
type CostCategory = { id: string; name: string };

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
  redirectTo,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  categories: CostCategory[];
  redirectTo: string;
}) {
  const router = useRouter();
  const flow = useDocumentUpload();

  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [department, setDepartment] = useState("");
  const [form, setForm] = useState({ category: categories[0]?.name ?? "Other", description: "", amount: "", expenseDate: "" });

  async function handleUploadAndExtract() {
    const extracted = (await flow.uploadAndExtract({ companyId, module: "finance", extractionKind: "company_expense" })) as ExtractedExpense | null;
    if (extracted) {
      const matchedCategory = categories.find((c) => c.name.toLowerCase() === (extracted.category ?? "").toLowerCase());
      setForm({
        category: matchedCategory?.name ?? categories[0]?.name ?? "Other",
        description: extracted.description ?? "",
        amount: extracted.amount?.toString() ?? "",
        expenseDate: extracted.expense_date ?? "",
      });
    }
  }

  async function handleConfirm() {
    if (!form.description || !form.amount || !form.expenseDate) {
      flow.setError("Description, amount and date are required.");
      return;
    }
    try {
      await flow.confirm(async () => {
        await createCompanyExpense({
          companyId,
          category: form.category,
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
      <ImportTabs tab={flow.tab} onSelect={flow.selectTab} pdfLabel="Upload PDF" photoLabel="Photo / Screenshot" />

      <div className="p-6">
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Company *</label>
            <select
              required
              disabled={flow.documentId !== null}
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className={`${inputClass} disabled:bg-surface-alt disabled:text-text-muted`}
            >
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Department</label>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass} placeholder="Optional" />
          </div>
        </div>

        {flow.step === "pick" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <FileDropZone
              file={flow.file}
              accept={flow.tab === "pdf" ? "application/pdf" : "image/*"}
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
            <ExtractionNotice notice={flow.notice} />
            <FormError error={flow.error} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Category *</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={inputClass}>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Expense Date *</label>
                <input type="date" value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} className={inputClass} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Description *</label>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputClass} placeholder="e.g. TNB electricity bill — September" />
            </div>

            <div>
              <label className={labelClass}>Amount (RM) *</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={inputClass} />
            </div>

            <ConfirmActions onCancel={() => router.push(redirectTo)} onConfirm={handleConfirm} saving={flow.saving} />
          </div>
        )}
      </div>
    </div>
  );
}
