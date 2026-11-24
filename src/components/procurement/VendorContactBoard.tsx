"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VENDOR_CATEGORIES, orderedCategories, type VendorContact } from "@/lib/procurement/vendorContacts";
import { deleteVendorContact, saveVendorContact, type VendorContactInput } from "@/lib/procurement/vendorContactActions";
import { downloadTableExcel, printTablePdf, type ExportTable } from "@/lib/export/tableExport";

const blank = (category = ""): VendorContactInput => ({ category, name: "", contactPerson: "", address: "", phone: "", cellPhone: "", email: "", notes: "" });
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
});

const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";
const field = "h-10 w-full rounded-lg border border-border-strong bg-white px-3 text-[13.5px] outline-none focus:border-primary";

/** The Vendor Contact List: one card per category (Baker, Car / Shuttle, Photographer ...) with the name, address and phones of each vendor. */
export function VendorContactBoard({ contacts }: { contacts: VendorContact[] }) {
  const router = useRouter();
  const [form, setForm] = useState<VendorContactInput | null>(null);
  const [customCategory, setCustomCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showEmpty, setShowEmpty] = useState(true);
  const [pending, startTransition] = useTransition();

  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () => contacts.filter((c) => !q || [c.name, c.category, c.contact_person, c.phone, c.cell_phone, c.address, c.notes].some((v) => (v ?? "").toLowerCase().includes(q))),
    [contacts, q],
  );
  const categories = orderedCategories(contacts).filter((cat) => (showEmpty && !q) || shown.some((c) => c.category === cat));

  const open = (value: VendorContactInput) => {
    setError(null);
    setCustomCategory(!!value.category && !(VENDOR_CATEGORIES as readonly string[]).includes(value.category));
    setForm(value);
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
    columns: ["Category", "Name", "Contact person", "Address", "Phone", "Cell phone", "Email", "Notes"],
    rows: orderedCategories(shown).flatMap((cat) =>
      shown.filter((c) => c.category === cat).map((c) => [cat, c.name, c.contact_person ?? "", c.address ?? "", c.phone ?? "", c.cell_phone ?? "", c.email ?? "", c.notes ?? ""]),
    ),
    landscape: true,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor, category or phone..." className="h-10 w-72 rounded-lg border border-border bg-surface px-3 text-[13px] outline-none" />
        <label className="flex items-center gap-2 text-[13px] text-text-secondary">
          <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
          Show empty categories
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={table.rows.length === 0} onClick={() => downloadTableExcel(table)}>Export Excel</button>
          <button type="button" className={btn} disabled={table.rows.length === 0} onClick={() => printTablePdf(table, window.open("", "_blank"))}>Print</button>
          <button type="button" onClick={() => open(blank())} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">+ Add Vendor</button>
        </div>
      </div>

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

      {categories.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-text-muted">No vendor matches this search.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((cat) => {
            const list = shown.filter((c) => c.category === cat).sort((a, b) => a.name.localeCompare(b.name));
            return (
              <div key={cat} className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-text">{cat}</div>
                  <button type="button" onClick={() => open(blank(cat))} className="text-[12.5px] font-semibold text-primary hover:underline">+ Add</button>
                </div>
                {list.length === 0 ? (
                  <div className="space-y-1.5 text-[12.5px] text-text-muted">
                    {["Name", "Address", "Phone", "Cell Phone"].map((l) => (
                      <div key={l} className="border-b border-dashed border-border pb-1">{l}:</div>
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {list.map((c) => (
                      <div key={c.id} className="py-2 text-[12.5px]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[13.5px] font-bold text-text">{c.name}</div>
                          <div className="flex shrink-0 gap-2">
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
                        {c.contact_person && <div className="text-text-secondary">Contact: {c.contact_person}</div>}
                        <div className="text-text-secondary">Address: <span className="text-text">{c.address || "—"}</span></div>
                        <div className="text-text-secondary">Phone: {c.phone ? <a href={`tel:${c.phone}`} className="text-text hover:underline">{c.phone}</a> : "—"}</div>
                        <div className="text-text-secondary">
                          Cell Phone:{" "}
                          {c.cell_phone ? (
                            <>
                              <a href={`tel:${c.cell_phone}`} className="text-text hover:underline">{c.cell_phone}</a>
                              <a href={`https://wa.me/${c.cell_phone.replace(/\D/g, "").replace(/^0/, "60")}`} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-success hover:underline">WhatsApp</a>
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                        {c.email && <div className="text-text-secondary">Email: <a href={`mailto:${c.email}`} className="text-text hover:underline">{c.email}</a></div>}
                        {c.notes && <div className="mt-0.5 text-text-muted">{c.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
