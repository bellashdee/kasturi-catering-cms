"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MALAYSIAN_BANKS, VENDOR_CATEGORIES, orderedCategories, type VendorContact } from "@/lib/procurement/vendorContacts";
import { deleteVendorContact, saveVendorContact, type VendorContactInput } from "@/lib/procurement/vendorContactActions";
import { downloadTableExcel, printTablePdf, type ExportTable } from "@/lib/export/tableExport";
import { FILTER_FIELD, FILTER_INPUT } from "@/components/shared/ListFilters";

const blank = (category = ""): VendorContactInput => ({ category, name: "", contactPerson: "", address: "", phone: "", cellPhone: "", email: "", notes: "", bankName: "", bankAccountNo: "", bankAccountHolder: "" });
const toInput = (c: VendorContact): VendorContactInput => ({
  id: c.id,
  category: c.category,
  name: c.name,
  contactPerson: c.contact_person ?? "",
  address: c.address ?? "",
  phone: c.phone ?? "",
  cellPhone: c.cell_phone ?? "",
  email: c.email ?? "",
  notes: c.notes ?? "",
  bankName: c.bank_name ?? "",
  bankAccountNo: c.bank_account_no ?? "",
  bankAccountHolder: c.bank_account_holder ?? "",
});

const btnLg = "rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text disabled:opacity-50";
const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";
const field = "h-10 w-full rounded-lg border border-border-strong bg-white px-3 text-[13.5px] outline-none focus:border-primary";

const SORTS = { name: "Name", category: "Category", phone: "Phone" } as const;
type SortKey = keyof typeof SORTS;
const COLS = "grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1.3fr_1.4fr_7.5rem]";

/**
 * The Vendor Contact List, laid out like the Suppliers list: the title with the count and the buttons, the sub menu, one filter bar
 * (search, category, sort, order) and a table with one row per vendor. Edit opens the form above the table.
 */
export function VendorContactBoard({ contacts, subNav }: { contacts: VendorContact[]; subNav?: React.ReactNode }) {
  const router = useRouter();
  const [form, setForm] = useState<VendorContactInput | null>(null);
  const [customCategory, setCustomCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // what is typed in the filter bar, and what is applied (Apply Filters), like the other lists
  const [draft, setDraft] = useState({ q: "", category: "", sort: "category" as SortKey, dir: "asc" as "asc" | "desc" });
  const [applied, setApplied] = useState(draft);
  const [pending, startTransition] = useTransition();

  const q = applied.q.trim().toLowerCase();
  const shown = useMemo(() => {
    const rows = contacts.filter(
      (c) =>
        (!applied.category || c.category === applied.category) &&
        (!q || [c.name, c.category, c.contact_person, c.phone, c.cell_phone, c.address, c.email, c.notes, c.bank_name, c.bank_account_no, c.bank_account_holder].some((v) => (v ?? "").toLowerCase().includes(q))),
    );
    const order = orderedCategories(contacts);
    const key = (c: VendorContact): [string | number, string] =>
      applied.sort === "category" ? [order.indexOf(c.category), c.name] : applied.sort === "phone" ? [c.cell_phone || c.phone || "~", c.name] : [c.name, c.category];
    const sorted = [...rows].sort((a, b) => {
      const [a1, a2] = key(a);
      const [b1, b2] = key(b);
      const first = typeof a1 === "number" && typeof b1 === "number" ? a1 - b1 : String(a1).localeCompare(String(b1), undefined, { numeric: true, sensitivity: "base" });
      return first || a2.localeCompare(b2, undefined, { sensitivity: "base" });
    });
    return applied.dir === "desc" ? sorted.reverse() : sorted;
  }, [contacts, applied, q]);
  const usedCategories = orderedCategories(contacts).filter((cat) => contacts.some((c) => c.category === cat));
  const filtered = !!(q || applied.category);

  const open = (value: VendorContactInput) => {
    setError(null);
    setCustomCategory(!!value.category && !(VENDOR_CATEGORIES as readonly string[]).includes(value.category));
    setForm(value);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = () => {
    if (!form) return;
    setError(null);
    startTransition(async () => {
      const res = await saveVendorContact(form);
      if (res.ok) {
        setForm(null);
        router.refresh();
      } else setError(res.error);
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const res = await deleteVendorContact(id);
      if (res.ok) {
        setConfirmDelete(null);
        router.refresh();
      } else setError(res.error);
    });
  };

  const table: ExportTable = {
    title: "Vendor Contact List",
    subtitle: `Signature Solution Sdn Bhd & Kasturi Indah Sdn Bhd · ${shown.length} vendor${shown.length === 1 ? "" : "s"}`,
    columns: ["Name", "Category", "Contact person", "Phone", "Cell phone", "Address", "Email", "Bank", "Account no.", "Account holder", "Notes"],
    rows: shown.map((c) => [c.name, c.category, c.contact_person ?? "", c.phone ?? "", c.cell_phone ?? "", c.address ?? "", c.email ?? "", c.bank_name ?? "", c.bank_account_no ?? "", c.bank_account_holder ?? "", c.notes ?? ""]),
    landscape: true,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {contacts.length} vendor{contacts.length === 1 ? "" : "s"} · Vendor Contact List shared by Signature Solution Sdn Bhd and Kasturi Indah Sdn Bhd
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className={btnLg} disabled={table.rows.length === 0} onClick={() => downloadTableExcel(table)}>Export Excel</button>
          <button type="button" className={btnLg} disabled={table.rows.length === 0} onClick={() => printTablePdf(table, window.open("", "_blank"))}>Print</button>
          <button type="button" onClick={() => open(blank(applied.category))} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">+ New Vendor</button>
        </div>
      </div>

      {subNav}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(draft);
        }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm print:hidden"
      >
        <label className={FILTER_FIELD}>
          <span className="leading-4">Search</span>
          <input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="Search vendors by name or phone..." className={`${FILTER_INPUT} w-60`} />
        </label>
        <label className={FILTER_FIELD}>
          <span className="leading-4">Category</span>
          <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={`${FILTER_INPUT} w-48`}>
            <option value="">All categories</option>
            {usedCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className={FILTER_FIELD}>
          <span className="leading-4">Sort by</span>
          <select value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: e.target.value as SortKey })} className={`${FILTER_INPUT} w-44`}>
            {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className={FILTER_FIELD}>
          <span className="leading-4">Order</span>
          <select value={draft.dir} onChange={(e) => setDraft({ ...draft, dir: e.target.value as "asc" | "desc" })} className={`${FILTER_INPUT} w-36`}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
        <button
          type="button"
          onClick={() => {
            const empty = { q: "", category: "", sort: "category" as SortKey, dir: "asc" as const };
            setDraft(empty);
            setApplied(empty);
          }}
          className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text"
        >
          Clear
        </button>
      </form>

      {error && !form && <div className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}

      {form && (
        <div className="rounded-xl border border-primary/40 bg-surface p-4 shadow-sm">
          <div className="mb-3 text-[15px] font-bold text-text">{form.id ? "Edit vendor" : "Add vendor"}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
              Category *
              {customCategory ? (
                <div className="flex gap-2">
                  <input className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Type the category" />
                  <button type="button" className={btn} onClick={() => { setCustomCategory(false); setForm({ ...form, category: "" }); }}>List</button>
                </div>
              ) : (
                <select
                  className={field}
                  value={form.category}
                  onChange={(e) => {
                    if (e.target.value === "__new") {
                      setCustomCategory(true);
                      setForm({ ...form, category: "" });
                    } else setForm({ ...form, category: e.target.value });
                  }}
                >
                  <option value="">Choose...</option>
                  {orderedCategories(contacts).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__new">+ New category...</option>
                </select>
              )}
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
              Name *
              <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
              Contact person
              <input className={field} value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
              Email
              <input className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary sm:col-span-2">
              Address
              <textarea rows={2} className={`${field} h-auto py-2`} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
              Phone (office)
              <input className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
              Cell phone
              <input className={field} value={form.cellPhone} onChange={(e) => setForm({ ...form, cellPhone: e.target.value })} />
            </label>
            <div className="mt-1 text-[13px] font-bold text-text sm:col-span-2">Bank account (for transfer)</div>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
              Bank
              <input className={field} list="vendor-banks" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. Maybank" />
              <datalist id="vendor-banks">
                {MALAYSIAN_BANKS.map((b) => <option key={b} value={b} />)}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
              Account no.
              <input className={field} inputMode="numeric" value={form.bankAccountNo} onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })} placeholder="Digits only" />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary sm:col-span-2">
              Account holder name
              <input className={field} value={form.bankAccountHolder} onChange={(e) => setForm({ ...form, bankAccountHolder: e.target.value })} placeholder="As registered with the bank" />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary sm:col-span-2">
              Notes (price, service area, remarks)
              <input className={field} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          {error && <div className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={pending} onClick={save} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-60">{pending ? "Saving..." : "Save"}</button>
            <button type="button" disabled={pending} onClick={() => setForm(null)} className={btn}>Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {shown.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-text-muted">{filtered ? "No vendors match these filters." : "No vendors yet. Press + New Vendor to add one."}</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className={`${COLS} border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted`}>
                <div>Name</div>
                <div>Category</div>
                <div>Contact</div>
                <div>Phone</div>
                <div>Cell Phone</div>
                <div>Address</div>
                <div>Bank Account</div>
                <div className="text-right">Action</div>
              </div>
              {shown.map((c) => (
                <div key={c.id} className={`${COLS} items-start gap-2 border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt`}>
                  <div>
                    <button type="button" onClick={() => open(toInput(c))} className="text-left font-semibold text-text hover:text-primary">{c.name}</button>
                    {c.email && <div className="text-[12px] text-text-muted"><a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a></div>}
                    {c.notes && <div className="text-[12px] text-text-muted">{c.notes}</div>}
                  </div>
                  <div className="text-text-secondary">{c.category}</div>
                  <div className="text-text-secondary">{c.contact_person || "—"}</div>
                  <div className="text-text-secondary">{c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : "—"}</div>
                  <div className="text-text-secondary">
                    {c.cell_phone ? (
                      <>
                        <a href={`tel:${c.cell_phone}`} className="hover:underline">{c.cell_phone}</a>
                        <a href={`https://wa.me/${c.cell_phone.replace(/\D/g, "").replace(/^0/, "60")}`} target="_blank" rel="noreferrer" className="block text-[12px] font-semibold text-success hover:underline">WhatsApp</a>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="text-text-secondary">{c.address || "—"}</div>
                  <div className="text-text-secondary">
                    {c.bank_account_no ? (
                      <>
                        <div className="font-semibold text-text">{c.bank_name}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="tabular-nums">{c.bank_account_no}</span>
                          <CopyButton text={c.bank_account_no} />
                        </div>
                        {c.bank_account_holder && <div className="text-[12px] text-text-muted">{c.bank_account_holder}</div>}
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="flex justify-end gap-3 text-[12.5px]">
                    {confirmDelete === c.id ? (
                      <>
                        <button type="button" disabled={pending} onClick={() => remove(c.id)} className="font-semibold text-danger">Yes, delete</button>
                        <button type="button" onClick={() => setConfirmDelete(null)} className="font-semibold text-text-secondary">No</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => open(toInput(c))} className="font-semibold text-primary hover:underline">Edit</button>
                        <button type="button" onClick={() => setConfirmDelete(c.id)} className="font-semibold text-text-secondary hover:text-danger">Delete</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Copies the account number, to paste into online banking. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
      className="text-[11.5px] font-semibold text-primary hover:underline"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
