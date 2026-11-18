"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DOCUMENT_FILE_ACCEPT, uploadDocument, fileTypeFromMime } from "@/lib/documents/upload";
import { useDocumentUpload } from "@/lib/importFlow/useDocumentUpload";
import { ImportTabs, FileDropZone, ExtractionNotice, FormError, ConfirmActions } from "@/components/shared/import/ImportFlowAtoms";
import { createPayment, type DuplicateHit, type PaymentInput } from "@/lib/finance/paymentActions";
import {
  DEFAULT_RENTAL_DUE_DAY,
  PAYMENT_CATEGORY_LABEL,
  UTILITY_PROVIDERS,
  UTILITY_TYPE_LABEL,
  accountDisplay,
  dueDateFor,
  type PaymentCategory,
  type UtilityType,
} from "@/lib/finance/payments";
import { Select } from "@/components/ui/Select";

export type PaymentAccountOption = {
  id: string;
  companyId: string;
  category: PaymentCategory;
  name: string;
  provider: string | null;
  utilityType: UtilityType | null;
  bankName: string | null;
  accountNo: string | null;
  defaultDueDay: number | null;
};

type Company = { id: string; name: string };

type Extracted = {
  payee_name?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  utility_provider?: string | null;
  location?: string | null;
  utility_account_no?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  amount?: number | null;
  billing_month?: string | null;
  payment_of?: string | null;
  voucher_number?: string | null;
  company_name?: string | null;
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-surface-alt disabled:text-text-muted";
const readonlyClass = "mt-1.5 flex h-10 w-full items-center rounded-lg border border-border bg-bg px-3 text-sm text-text-secondary";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

function sameName(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

export function PaymentForm({
  category,
  companies,
  defaultCompanyId,
  accounts,
  initialYear,
  initialMonth,
  prefillAccountId,
  redirectTo,
}: {
  category: PaymentCategory;
  companies: Company[];
  defaultCompanyId?: string;
  accounts: PaymentAccountOption[];
  initialYear: number;
  initialMonth: number;
  prefillAccountId?: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const flow = useDocumentUpload();

  const prefill = accounts.find((a) => a.id === prefillAccountId);
  const [companyId, setCompanyId] = useState(prefill?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "");
  const [accountId, setAccountId] = useState(prefill?.id ?? "");
  const [provider, setProvider] = useState(prefill?.provider ?? "");
  const [month, setMonth] = useState(`${initialYear}-${String(initialMonth).padStart(2, "0")}`);
  const [form, setForm] = useState({
    payeeName: prefill?.name ?? "",
    bankName: prefill?.bankName ?? "",
    accountNo: prefill?.accountNo ?? "",
    paymentOf: "",
    invoiceNumber: "",
    invoiceDate: "",
    dueDate: prefill?.defaultDueDay ? dueDateFor(initialYear, initialMonth, prefill.defaultDueDay) : category === "rental" ? dueDateFor(initialYear, initialMonth, DEFAULT_RENTAL_DUE_DAY) : "",
    amount: "",
    voucherNumber: "",
    remarks: "",
  });
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateHit[] | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);

  const accountsForCompany = useMemo(() => accounts.filter((a) => a.companyId === companyId && a.category === category), [accounts, companyId, category]);
  const utilityAccounts = category === "utility" ? accountsForCompany.filter((a) => !provider || a.provider === provider) : accountsForCompany;
  const selectedAccount = accounts.find((a) => a.id === accountId);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDuplicates(null);
  }

  function dueFor(monthValue: string, day: number): string {
    const [y, m] = monthValue.split("-").map(Number);
    return y && m ? dueDateFor(y, m, day) : "";
  }

  function pickAccount(id: string) {
    setAccountId(id);
    const a = accounts.find((x) => x.id === id);
    if (!a) return;
    // a saved payee belongs to one company: choosing it puts the payment under that company
    if (a.companyId && a.companyId !== companyId) setCompanyId(a.companyId);
    setForm((f) => ({
      ...f,
      payeeName: a.name,
      bankName: a.bankName ?? "",
      accountNo: a.accountNo ?? "",
      dueDate: category === "rental" || a.defaultDueDay ? dueFor(month, a.defaultDueDay ?? DEFAULT_RENTAL_DUE_DAY) : f.dueDate,
    }));
    if (a.provider) setProvider(a.provider);
    setDuplicates(null);
  }

  function changeMonth(value: string) {
    setMonth(value);
    setDuplicates(null);
    // Rental: the due date follows the month (before the 7th by default) until the user changes it.
    if (category === "rental" && value) setForm((f) => ({ ...f, dueDate: dueFor(value, selectedAccount?.defaultDueDay ?? DEFAULT_RENTAL_DUE_DAY) }));
  }

  async function handleUploadAndExtract() {
    const extracted = (await flow.uploadAndExtract({ companyId, module: "finance", extractionKind: "finance_payment" })) as Extracted | null;
    if (!extracted) return;

    // Match the extracted payee / utility account against the reference list; never invent a match.
    let account: PaymentAccountOption | undefined;
    if (category === "utility" && extracted.utility_account_no) account = accountsForCompany.find((a) => a.accountNo && a.accountNo.replace(/\s/g, "") === extracted.utility_account_no!.replace(/\s/g, ""));
    if (!account && extracted.payee_name && category !== "utility") account = accountsForCompany.find((a) => sameName(a.name, extracted.payee_name!));
    if (!account && category === "utility" && extracted.location) account = accountsForCompany.find((a) => sameName(a.name, extracted.location!) && (!extracted.utility_provider || a.provider === extracted.utility_provider));

    if (account) {
      setAccountId(account.id);
      if (account.provider) setProvider(account.provider);
    } else if (category === "utility" && extracted.utility_provider) {
      setProvider(extracted.utility_provider);
    }
    const billingMonth = extracted.billing_month && /^\d{4}-\d{2}$/.test(extracted.billing_month) ? extracted.billing_month : month;
    setMonth(billingMonth);

    setForm((f) => ({
      ...f,
      payeeName: account?.name ?? (category === "utility" ? extracted.location ?? f.payeeName : extracted.payee_name ?? f.payeeName),
      bankName: extracted.bank_name ?? account?.bankName ?? f.bankName,
      accountNo: extracted.bank_account_no ?? extracted.utility_account_no ?? account?.accountNo ?? f.accountNo,
      paymentOf: extracted.payment_of ?? f.paymentOf,
      invoiceNumber: extracted.invoice_number ?? "",
      invoiceDate: extracted.invoice_date ?? "",
      dueDate: extracted.due_date ?? f.dueDate,
      amount: extracted.amount != null ? String(extracted.amount) : "",
      voucherNumber: extracted.voucher_number ?? f.voucherNumber,
    }));

    const named = companies.find((c) => c.id === companyId)?.name ?? "";
    setMismatch(extracted.company_name && named && !sameName(extracted.company_name, named) ? `The document is addressed to "${extracted.company_name}" but you are saving it under ${named}. Check the company (Payment Of) before confirming.` : null);
  }

  async function save(allowDuplicate: boolean) {
    flow.setError(null);
    const amount = Number(form.amount);
    if (!form.payeeName.trim() || !month || !form.dueDate || !amount) {
      flow.setError("Payee, payment month, due date and amount are required.");
      return;
    }
    setSaving(true);
    try {
      let documentId = flow.documentId ?? undefined;
      if (!documentId && manualFile) {
        const doc = await uploadDocument({ companyId, module: "finance", fileType: fileTypeFromMime(manualFile), file: manualFile });
        documentId = doc.id;
      }
      const account = selectedAccount;
      const payload: PaymentInput = {
        companyId,
        category,
        accountId: account?.id,
        payeeName: form.payeeName,
        bankName: form.bankName || undefined,
        accountNo: form.accountNo || undefined,
        utilityProvider: category === "utility" ? provider || undefined : undefined,
        utilityLocation: category === "utility" ? form.payeeName : undefined,
        utilityType: category === "utility" ? account?.utilityType ?? undefined : undefined,
        paymentOf: form.paymentOf || undefined,
        periodMonth: `${month}-01`,
        invoiceNumber: form.invoiceNumber || undefined,
        invoiceDate: form.invoiceDate || undefined,
        dueDate: form.dueDate,
        amount,
        voucherNumber: form.voucherNumber || undefined,
        documentId,
        remarks: form.remarks || undefined,
      };
      const result = await createPayment(payload, { allowDuplicate });
      if ("duplicates" in result) {
        setDuplicates(result.duplicates);
        setSaving(false);
        return;
      }
      router.push(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}saved=1`);
      router.refresh();
    } catch (err) {
      flow.setError(err instanceof Error ? err.message : "Could not save the payment.");
      setSaving(false);
    }
  }

  const isUtility = category === "utility";
  const isRental = category === "rental";

  const formBody = (
    <div className="flex flex-col gap-4">
      <ExtractionNotice notice={flow.notice} report={flow.report} />
      {mismatch && <div className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-[13px] font-semibold text-warning">{mismatch}</div>}
      <FormError error={flow.error} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>{category === "supplier" ? "Payment Of (company) *" : "Company *"}</label>
          <Select
            value={companyId}
            disabled={flow.documentId !== null || companies.length === 1}
            onChange={(e) => { setCompanyId(e.target.value); setAccountId(""); setProvider(""); setDuplicates(null); }}
            className={inputClass}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label className={labelClass}>{isUtility ? "Billing Month *" : isRental ? "Rental Month *" : "Payment Month *"}</label>
          <input type="month" value={month} onChange={(e) => changeMonth(e.target.value)} className={inputClass} />
        </div>
      </div>

      {isUtility && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Utility Provider *</label>
            <Select value={provider} onChange={(e) => { setProvider(e.target.value); setAccountId(""); }} className={inputClass}>
              <option value="">Select provider</option>
              {UTILITY_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div>
            <label className={labelClass}>Location / Account Name *</label>
            <Select value={accountId} onChange={(e) => pickAccount(e.target.value)} className={inputClass}>
              <option value="">Select location</option>
              {utilityAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.utilityType ? ` — ${UTILITY_TYPE_LABEL[a.utilityType].replace("Utility – ", "")}` : ""}</option>)}
            </Select>
          </div>
        </div>
      )}

      {isRental && (
        <div>
          <label className={labelClass}>Rental / Payee *</label>
          <Select value={accountId} onChange={(e) => pickAccount(e.target.value)} className={inputClass}>
            <option value="">Select rental / payee</option>
            {/* every saved payee with its company (the chosen company's first); choosing one sets the company */}
            {[...companies]
              .sort((x, y) => Number(y.id === companyId) - Number(x.id === companyId))
              .flatMap((c) => accounts.filter((a) => a.category === category && a.companyId === c.id).map((a) => <option key={a.id} value={a.id}>{`${a.name} · ${c.name}`}</option>))}
          </Select>
          <p className="mt-1 text-[11.5px] text-text-muted">Choosing a payee puts the payment under that payee&apos;s company.</p>
        </div>
      )}

      {category === "supplier" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Pay To (supplier) *</label>
            <input
              list="supplier-names"
              value={form.payeeName}
              onChange={(e) => {
                set("payeeName", e.target.value);
                const known = accountsForCompany.find((a) => a.name.toLowerCase() === e.target.value.trim().toLowerCase());
                if (known) pickAccount(known.id); else setAccountId("");
              }}
              className={inputClass}
              placeholder="Choose a saved supplier or type a new name"
            />
            <datalist id="supplier-names">{accountsForCompany.map((a) => <option key={a.id} value={a.name} />)}</datalist>
          </div>
          <div>
            <label className={labelClass}>In payment of</label>
            <input value={form.paymentOf} onChange={(e) => set("paymentOf", e.target.value)} className={inputClass} placeholder="e.g. A/C AUGUST 2026" />
          </div>
        </div>
      )}

      {category === "supplier" ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Supplier Bank Name</label>
            <input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Supplier Bank Account Number</label>
            <input value={form.accountNo} onChange={(e) => set("accountNo", e.target.value)} className={inputClass} inputMode="numeric" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Bank Name</label>
            <div className={readonlyClass}>{form.bankName || "—"}</div>
          </div>
          <div>
            <label className={labelClass}>{isUtility ? "Account No." : "Bank Account Number"}</label>
            <div className={readonlyClass}>{accountDisplay(form.accountNo)}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>{isUtility ? "Bill Number" : "Invoice Number"}</label>
          <input value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{isUtility ? "Bill Date" : "Invoice Date"}</label>
          <input type="date" value={form.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Amount to Pay (RM) *</label>
          <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} className={inputClass} placeholder="From the actual invoice / bill" />
        </div>
        <div>
          <label className={labelClass}>Due Date *</label>
          <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={inputClass} />
          {isRental && <p className="mt-1 text-[11.5px] text-text-muted">Default is before the {DEFAULT_RENTAL_DUE_DAY}th. Change it if the agreement or invoice says otherwise.</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Payment Voucher No.</label>
          <input value={form.voucherNumber} onChange={(e) => set("voucherNumber", e.target.value)} className={inputClass} placeholder="Optional - upload the voucher on the payment page" />
        </div>
        <div>
          <label className={labelClass}>Remarks</label>
          <input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className={inputClass} />
        </div>
      </div>

      {flow.tab === "manual" && (
        <div>
          <label className={labelClass}>{isUtility ? "Bill" : isRental ? "Rental agreement / invoice" : "Invoice"} / supporting document (optional)</label>
          <input type="file" accept="application/pdf,image/*,.xlsx,.xls,.csv" onChange={(e) => setManualFile(e.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-[13px]" />
        </div>
      )}

      {duplicates && duplicates.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg p-3">
          <div className="text-[13px] font-bold text-danger">Possible duplicate — a matching payment already exists:</div>
          {duplicates.map((d) => <div key={d.id} className="mt-1 text-xs text-danger">{d.label}</div>)}
        </div>
      )}

      <ConfirmActions
        onCancel={() => router.push(redirectTo)}
        onConfirm={() => void save(!!duplicates && duplicates.length > 0)}
        saving={saving}
        danger={!!duplicates && duplicates.length > 0}
        label="Confirm & Save Payment"
        dangerLabel="Save Anyway"
      />
    </div>
  );

  return (
    <div>
      <ImportTabs tab={flow.tab} onSelect={flow.selectTab} pdfLabel="Upload File (PDF / Excel / CSV)" photoLabel="Photo / Screenshot" />
      <div className="p-6">
        <p className="mb-4 text-[12.5px] text-text-secondary">
          {PAYMENT_CATEGORY_LABEL[category]}: amounts always come from the actual invoice / bill / voucher or your own key-in. Nothing is saved until you confirm it.
        </p>
        {flow.step === "pick" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <FileDropZone
              file={flow.file}
              accept={flow.tab === "pdf" ? DOCUMENT_FILE_ACCEPT : "image/*"}
              prompt={`Click to choose the ${flow.tab === "pdf" ? "invoice / bill / voucher file" : "photo or screenshot"}`}
              onChange={flow.setFile}
            />
            <FormError error={flow.error} />
            <button onClick={handleUploadAndExtract} disabled={!flow.file || flow.uploading} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
              {flow.uploading ? "Uploading & reading document..." : "Upload & Extract"}
            </button>
          </div>
        ) : (
          formBody
        )}
      </div>
    </div>
  );
}
