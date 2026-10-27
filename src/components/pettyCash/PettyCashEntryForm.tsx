"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { errorMessage } from "@/lib/actionResult";
import { todayInMalaysia } from "@/lib/format";
import { createPettyCashEntry, updatePettyCashEntry } from "@/lib/operationPettyCash/actions";
import { createPettyCashTransaction } from "@/lib/finance/actions";
import { PAYMENT_METHOD_LABEL, PETTY_CASH_CATEGORIES, type OperationPettyCashRow } from "@/lib/operationPettyCash/constants";
import { DescriptionInput } from "@/components/DescriptionInput";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { positionOptions, type PersonOption } from "@/lib/pettyCash/people";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };
type EntryKind = "expense" | "top_up" | "claim";

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[12px] font-semibold text-text-secondary";

/**
 * One form for the petty cash: money received, money spent (with the receipt) or a staff claim that still has to be paid. It always
 * belongs to one person's petty cash (the name and the position chosen at the top). Also used to edit a cash book entry.
 */
export function PettyCashEntryForm({
  companies,
  defaultCompanyId,
  editing,
  listHref,
  people,
  holders,
  holderName,
  holderPosition,
  allowBook,
  allowClaim,
  lockName = false,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  editing?: OperationPettyCashRow;
  listHref: string;
  people: PersonOption[];
  /** the people who hold a petty cash */
  holders: PersonOption[];
  holderName: string;
  holderPosition: string;
  /** may record money received / spent (the cash book) */
  allowBook: boolean;
  /** may record a staff claim */
  allowClaim: boolean;
  /** the person sees only their own petty cash: the name is theirs and cannot be changed */
  lockName?: boolean;
}) {
  const router = useRouter();
  const kinds: EntryKind[] = [...(allowBook ? (["expense", "top_up"] as const) : []), ...(allowClaim ? (["claim"] as const) : [])];
  const [companyId, setCompanyId] = useState(editing?.company_id ?? defaultCompanyId ?? companies[0]?.id ?? "");
  // a new entry can be for more than one company (for example the float given for both): it is keyed in once, with one amount, and counted once
  const [companyIds, setCompanyIds] = useState<string[]>([editing?.company_id ?? defaultCompanyId ?? companies[0]?.id ?? ""].filter(Boolean));
  const [kind, setKind] = useState<EntryKind>(editing?.entry_type ?? kinds[0] ?? "expense");
  const [date, setDate] = useState(editing?.entry_date ?? todayInMalaysia());
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [paymentMethod, setPaymentMethod] = useState(editing?.payment_method ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [personName, setPersonName] = useState(editing?.person_name ?? holderName);
  const [personPosition, setPersonPosition] = useState(editing?.person_position ?? holderPosition);
  const [claimant, setClaimant] = useState("");
  const [department, setDepartment] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenCompanies = companies.filter((c) => companyIds.includes(c.id));
  const firstCompanyId = editing ? companyId : (chosenCompanies[0]?.id ?? "");
  const alsoCompanyIds = editing ? undefined : chosenCompanies.slice(1).map((c) => c.id);
  const toggleCompany = (id: string) => setCompanyIds((ids) => (ids.includes(id) ? (ids.length > 1 ? ids.filter((x) => x !== id) : ids) : [...ids, id]));
  const isClaim = kind === "claim";
  const isReceived = kind === "top_up";
  const fillPosition = (name: string) => {
    const found = holders.find((p) => p.name === name);
    if (found?.position) setPersonPosition(found.position);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personName.trim() || !personPosition.trim()) {
      setError("Choose whose petty cash this is: the name and the position.");
      return;
    }
    if (isClaim && !claimant.trim()) {
      setError("Enter who is claiming this petty cash.");
      return;
    }
    if (isReceived && !paymentMethod) {
      setError("Choose how the money was received: cash or online transfer.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let documentId: string | undefined;
      if (receipt) {
        const doc = await uploadDocument({ companyId: firstCompanyId, module: isClaim ? "finance" : "driver-logistics", fileType: fileTypeFromMime(receipt), file: receipt, skipMarkdown: !isClaim });
        documentId = doc.id;
      }
      const result = isClaim
        ? await createPettyCashTransaction({
            companyId: firstCompanyId,
            alsoCompanyIds,
            type: "expense",
            claimantName: claimant.trim(),
            claimantDepartment: department.trim() || undefined,
            category: category || undefined,
            description: description || undefined,
            amount: Number(amount),
            transactionDate: date,
            documentId,
            personName: personName.trim(),
            personPosition: personPosition.trim(),
          })
        : editing
          ? await updatePettyCashEntry(editing.id, { companyId: firstCompanyId, paymentMethod: isReceived ? paymentMethod : undefined, entryType: kind as "expense" | "top_up", entryDate: date, category: category || undefined, description: description || undefined, amount: Number(amount), documentId, personName: personName || undefined, personPosition: personPosition || undefined })
          : await createPettyCashEntry({ companyId: firstCompanyId, alsoCompanyIds, paymentMethod: isReceived ? paymentMethod : undefined, entryType: kind as "expense" | "top_up", entryDate: date, category: category || undefined, description: description || undefined, amount: Number(amount), documentId, personName: personName || undefined, personPosition: personPosition || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (editing) {
        router.push(listHref);
      } else {
        setAmount("");
        setPaymentMethod("");
        setCategory("");
        setDescription("");
        setClaimant("");
        setDepartment("");
        setPersonName(holderName);
        setPersonPosition(holderPosition);
        setReceipt(null);
        (e.target as HTMLFormElement).reset();
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  if (kinds.length === 0) return null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="text-[15px] font-bold text-text">{editing ? "Edit entry" : "New entry"}</div>
      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className={editing ? "" : "sm:col-span-4"}>
          <label className={labelClass}>{editing ? "Company *" : "Company * (choose one or more)"}</label>
          {editing ? (
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputClass}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {companies.map((c) => (
                <button key={c.id} type="button" aria-pressed={companyIds.includes(c.id)} onClick={() => toggleCompany(c.id)} className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${companyIds.includes(c.id) ? "border-primary bg-primary text-white" : "border-border-strong bg-white text-text hover:bg-surface-alt"}`}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className={labelClass}>Type *</label>
          <Select value={kind} disabled={!!editing} onChange={(e) => setKind(e.target.value as EntryKind)} className={inputClass}>
            {kinds.includes("expense") && <option value="expense">Spent</option>}
            {kinds.includes("top_up") && <option value="top_up">Receive</option>}
            {kinds.includes("claim") && <option value="claim">Staff claim</option>}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" required max={todayInMalaysia()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Amount (RM) *</label>
          <input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </div>
        {isReceived && (
          <div>
            <label className={labelClass}>Payment received by *</label>
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} required className={inputClass}>
              <option value="">Select cash or online transfer</option>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([value, text]) => (
                <option key={value} value={value}>{text}</option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{isReceived ? "Received by (choose the name) *" : isClaim ? "Paid from the petty cash of (choose the name) *" : "Spent by (choose the name) *"}</label>
          {lockName ? (
            <input value={personName} readOnly className={`${inputClass} cursor-not-allowed bg-surface-alt`} />
          ) : (
            <SearchSelect value={personName} onChange={setPersonName} options={holders.map((p) => p.name)} onPick={fillPosition} className={inputClass} placeholder="Search or type a name" />
          )}
        </div>
        <div>
          <label className={labelClass}>Position that holds the petty cash *</label>
          <SearchSelect value={personPosition} onChange={setPersonPosition} options={positionOptions(holders)} className={inputClass} placeholder="Search or type a position" />
        </div>
      </div>

      {isClaim && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Claimant / Requested By *</label>
            <SearchSelect
              value={claimant}
              onChange={setClaimant}
              options={people.map((p) => p.name)}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!isReceived && (
          <div>
            <label className={labelClass}>Category</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              <option value="">Select category</option>
              {PETTY_CASH_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
        )}
        <div className={isReceived ? "sm:col-span-2" : ""}>
          <label className={labelClass}>{isReceived ? "Description (e.g. who gave the money)" : isClaim ? "Purpose / Description" : "What was it spent on?"}</label>
          <DescriptionInput value={description} onChange={setDescription} companyId={firstCompanyId} className={inputClass} placeholder={isReceived ? "e.g. Float from Ms. Penny" : "e.g. Petrol for event delivery"} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Receipt / photo {isReceived ? "(optional)" : "(keep it with the record)"}</label>
        <input type="file" accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[13px]" />
        {editing?.document_id && !receipt && <p className="mt-1 text-[11.5px] text-text-muted">A receipt is already attached. Choose a file only to replace it.</p>}
      </div>

      <div className="flex justify-end gap-2.5">
        {editing && (
          <Link href={listHref} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Cancel
          </Link>
        )}
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
          {saving ? "Saving..." : editing ? "Save changes" : isClaim ? "Submit claim" : isReceived ? "Save top-up" : "Save spending"}
        </button>
      </div>
    </form>
  );
}
