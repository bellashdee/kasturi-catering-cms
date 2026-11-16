"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { requestAttachmentUpload, searchFormCustomers, submitQuotationRequest } from "@/lib/catering/quotationRequestActions";
import { submitCustomerIntake } from "@/lib/catering/intakeActions";
import { EVENT_TYPE_OPTIONS, ACTIVE_SALES_AGENTS } from "@/lib/catering/constants";
import { dayAmount, type EventDay } from "@/lib/catering/days";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_BUCKET,
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MAX_BYTES,
  MAX_ATTACHMENTS,
  attachmentExtension,
  type QuotationRequestInput,
  type RequestAttachment,
} from "@/lib/catering/quotationRequest";
import { emptyCustomerNeeds, extraItemsOf, type CustomerNeedsValue } from "@/lib/catering/customerNeeds";
import { EventDaysEditor, emptyDay } from "@/components/catering/EventDaysEditor";
import { CustomerNeedsSection } from "@/components/catering/CustomerNeedsSection";
import { ChoiceSelect } from "@/components/ui/ChoiceSelect";

const AGENT_OPTIONS = ACTIVE_SALES_AGENTS.map((a) => ({ value: a, label: a }));
const TYPE_OPTIONS = EVENT_TYPE_OPTIONS.map(([value, label]) => ({ value, label }));

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";
const sectionTitle = "text-[14px] font-extrabold text-text";

type Header = Omit<QuotationRequestInput, "days" | "extraItems" | "additional" | "requirements" | "attachments" | "kitchenSetup" | "cateringSetup" | "remarks">;

const emptyHeader: Header = {
  salesAgent: "",
  customerName: "",
  customerId: "",
  eventName: "",
  eventType: "",
  location: "",
  picName: "",
  picPhone: "",
  contactEmail: "",
  companyAddress: "",
  eventAddress: "",
  website: "",
};

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

type NewCustomer = { name: string; contactPerson: string; phone: string; email: string; address: string };
const emptyCustomer: NewCustomer = { name: "", contactPerson: "", phone: "", email: "", address: "" };

/**
 * The quotation request form of one company. Signature Solution has one customer (JDT FC) and one agent, so its form asks for neither and
 * has no PIC; the other companies search the saved customers by name, or add a new customer (sent to the office to check) first.
 */
export function PublicQuotationForm({ companySlug, fixedCustomer, fixedAgent }: { companySlug: string; fixedCustomer?: string; fixedAgent?: string }) {
  const [form, setForm] = useState<Header>(emptyHeader);
  // the saved customers whose name has the words typed (names only: the contact details stay on the server)
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([]);
  const [showMatches, setShowMatches] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCustomer, setNewCustomer] = useState<NewCustomer>(emptyCustomer);
  const [customerBusy, setCustomerBusy] = useState(false);
  const [customerMessage, setCustomerMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (fixedCustomer || form.customerId) return;
    const text = form.customerName.trim();
    if (text.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      void searchFormCustomers(companySlug, text).then((list) => {
        if (live) setMatches(list);
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [companySlug, fixedCustomer, form.customerName, form.customerId]);

  async function saveNewCustomer() {
    if (!form.salesAgent) {
      setCustomerMessage({ ok: false, text: "Choose your name (sales agent) first." });
      return;
    }
    setCustomerBusy(true);
    setCustomerMessage(null);
    const r = await submitCustomerIntake(companySlug, {
      salesAgent: form.salesAgent,
      name: newCustomer.name,
      contactPerson: newCustomer.contactPerson,
      phone: newCustomer.phone,
      email: newCustomer.email,
      billingAddress: newCustomer.address,
    });
    setCustomerBusy(false);
    if (!r.ok) {
      setCustomerMessage({ ok: false, text: r.error ?? "Could not save the customer." });
      return;
    }
    // the new customer's details fill the request; the office adds the customer after checking it
    setForm((f) => ({ ...f, customerId: "", customerName: newCustomer.name.trim(), picName: newCustomer.contactPerson.trim(), picPhone: newCustomer.phone.trim(), contactEmail: newCustomer.email.trim(), companyAddress: newCustomer.address.trim() }));
    setNewCustomer(emptyCustomer);
    setAdding(false);
    setMatches([]);
    setCustomerMessage({ ok: true, text: "Customer saved and sent to the office. Continue with the request below." });
  }
  const [days, setDays] = useState<EventDay[]>([emptyDay()]);
  const [needs, setNeeds] = useState<CustomerNeedsValue>(emptyCustomerNeeds());
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ name: string; code?: string; warning?: string } | null>(null);

  function set<K extends keyof Header>(key: K, value: Header[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const daysTotal = days.reduce((t, d) => t + dayAmount(d), 0);

  function addFiles(list: FileList | null) {
    setError(null);
    const picked = Array.from(list ?? []);
    const bad = picked.find((f) => !ATTACHMENT_EXTENSIONS.includes(attachmentExtension(f.name)) || f.size > ATTACHMENT_MAX_BYTES || f.size === 0);
    if (bad) {
      setError(`${bad.name}: attach a PDF, a photo, a Word or an Excel file smaller than 10 MB.`);
      return;
    }
    const next = [...files, ...picked];
    if (next.length > MAX_ATTACHMENTS) {
      setError(`At most ${MAX_ATTACHMENTS} attachments.`);
      return;
    }
    setFiles(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const noMeal = days.findIndex((d) => d.mealTypes.length === 0);
    if (noMeal >= 0) {
      setError(`Day ${noMeal + 1}: select at least one meal type.`);
      return;
    }
    setError(null);
    try {
      // the files go straight to the private bucket, each with a one-time permission from the server
      const attachments: RequestAttachment[] = [];
      if (files.length > 0) {
        setStep("uploading");
        const storage = createClient().storage.from(ATTACHMENT_BUCKET);
        for (const file of files) {
          const permission = await requestAttachmentUpload(companySlug, { name: file.name, size: file.size });
          if (!permission.ok || !permission.path || !permission.token) throw new Error(permission.error ?? "Could not prepare the upload.");
          const { error: uploadError } = await storage.uploadToSignedUrl(permission.path, permission.token, file, { contentType: file.type || undefined });
          if (uploadError) throw new Error(`${file.name} could not be uploaded. Check your connection and try again.`);
          attachments.push({ path: permission.path, name: file.name, mime: file.type || undefined, size: file.size });
        }
      }

      setStep("saving");
      const result = await submitQuotationRequest(companySlug, {
        ...form,
        customerId: form.customerId || undefined,
        days,
        extraItems: extraItemsOf(needs.extras),
        additional: needs.additional,
        requirements: needs.requirements,
        kitchenSetup: needs.kitchenSetup,
        cateringSetup: needs.cateringSetup,
        remarks: needs.remarks,
        attachments,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
      } else {
        setSent({ name: form.eventName, code: result.requestCode, warning: result.warning });
        // keep the sales agent selected so several requests can be sent one after another
        setForm({ ...emptyHeader, salesAgent: form.salesAgent });
        setCustomerMessage(null);
        setDays([emptyDay()]);
        setNeeds(emptyCustomerNeeds());
        setFiles([]);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
    setStep("idle");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {sent && (
        <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-sm text-success">
          Thank you. The quotation request for <span className="font-semibold">{sent.name}</span> was sent to the office
          {sent.code && <> (Request ID <span className="font-extrabold">{sent.code}</span>)</>}. You can fill in another one below.
          {sent.warning && <div className="mt-1 font-semibold text-warning">{sent.warning}</div>}
        </div>
      )}
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      {!fixedAgent && (
        <div>
          <label className={labelClass}>Sales agent *</label>
          <ChoiceSelect required value={form.salesAgent} onChange={(v) => set("salesAgent", v)} options={AGENT_OPTIONS} placeholder="Search and choose your name" className={inputClass} />
        </div>
      )}

      {fixedCustomer ? (
        <div>
          <div className={sectionTitle}>Customer</div>
          <div className="mt-1.5 rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-sm font-bold text-text">{fixedCustomer}</div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className={sectionTitle}>Customer information</div>
            <button type="button" onClick={() => { setAdding((a) => !a); setCustomerMessage(null); }} className="rounded-lg border border-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary">
              {adding ? "Close" : "+ New customer (not in the list)"}
            </button>
          </div>
          {customerMessage && <div className={`rounded-lg px-3 py-2 text-[12.5px] ${customerMessage.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{customerMessage.text}</div>}
          {adding && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-3">
              <p className="text-xs text-text-muted">Fill in the new customer once. It is sent to the office to add, and its details fill this request.</p>
              <div>
                <label className={labelClass}>Customer / company name *</label>
                <input maxLength={200} value={newCustomer.name} onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))} className={inputClass} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Contact person (PIC) *</label>
                  <input maxLength={200} value={newCustomer.contactPerson} onChange={(e) => setNewCustomer((c) => ({ ...c, contactPerson: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Contact number *</label>
                  <input type="tel" inputMode="tel" maxLength={50} value={newCustomer.phone} onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))} className={inputClass} placeholder="e.g. 012-3456789" />
                </div>
                <div>
                  <label className={labelClass}>E-mail address</label>
                  <input type="email" maxLength={200} value={newCustomer.email} onChange={(e) => setNewCustomer((c) => ({ ...c, email: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Company address</label>
                  <input maxLength={500} value={newCustomer.address} onChange={(e) => setNewCustomer((c) => ({ ...c, address: e.target.value }))} className={inputClass} />
                </div>
              </div>
              <button type="button" disabled={customerBusy || !newCustomer.name.trim() || !newCustomer.contactPerson.trim() || !newCustomer.phone.trim()} onClick={() => void saveNewCustomer()} className="self-start rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
                {customerBusy ? "Saving..." : "Save customer"}
              </button>
            </div>
          )}
          <div className="relative">
            <label className={labelClass}>Customer / company name * <span className="font-normal text-text-muted">(type to search the saved customers)</span></label>
            <input
              required
              maxLength={200}
              value={form.customerName}
              onChange={(e) => { setForm((f) => ({ ...f, customerName: e.target.value, customerId: "" })); setShowMatches(true); }}
              onFocus={() => setShowMatches(true)}
              onBlur={() => setTimeout(() => setShowMatches(false), 150)}
              autoComplete="off"
              className={inputClass}
            />
            {showMatches && !form.customerId && form.customerName.trim().length >= 2 && matches.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setForm((f) => ({ ...f, customerName: m.name, customerId: m.id })); setShowMatches(false); }} className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-surface-alt">
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {form.customerId ? (
              <p className="mt-1 text-xs text-success">Saved customer chosen: the contact details left empty below are filled from the customer record.</p>
            ) : form.customerName.trim().length >= 2 && matches.length === 0 ? (
              <p className="mt-1 text-xs text-text-muted">Not in the list? Use &quot;+ New customer&quot; above.</p>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Contact person (PIC) {form.customerId ? "" : "*"}</label>
              <input required={!form.customerId} maxLength={200} value={form.picName} onChange={(e) => set("picName", e.target.value)} className={inputClass} placeholder={form.customerId ? "Leave empty to use the saved contact" : "Person in charge"} />
            </div>
            <div>
              <label className={labelClass}>Contact number {form.customerId ? "" : "*"}</label>
              <input required={!form.customerId} type="tel" inputMode="tel" maxLength={50} value={form.picPhone} onChange={(e) => set("picPhone", e.target.value)} className={inputClass} placeholder={form.customerId ? "Leave empty to use the saved number" : "e.g. 012-3456789"} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>E-mail address</label>
              <input type="email" maxLength={200} value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={inputClass} placeholder="name@company.com" />
            </div>
            <div>
              <label className={labelClass}>Company address</label>
              <input maxLength={500} value={form.companyAddress} onChange={(e) => set("companyAddress", e.target.value)} className={inputClass} />
            </div>
          </div>
        </>
      )}

      <div className={sectionTitle}>Event information</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className={labelClass}>Event name *</label>
          <textarea required maxLength={500} rows={2} value={form.eventName} onChange={(e) => set("eventName", e.target.value)} className="mt-1.5 w-full resize-y rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="e.g. Annual Conference 2026 (press Enter for a new line)" />
        </div>
        <div>
          <label className={labelClass}>Event type *</label>
          <ChoiceSelect required value={form.eventType} onChange={(v) => set("eventType", v)} options={TYPE_OPTIONS} placeholder="Search and choose the event type" className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Event location *</label>
          <input required maxLength={300} value={form.location} onChange={(e) => set("location", e.target.value)} className={inputClass} placeholder="e.g. Dewan Serbaguna, Menara ABC" />
        </div>
        <div>
          <label className={labelClass}>Address</label>
          <input maxLength={500} value={form.eventAddress} onChange={(e) => set("eventAddress", e.target.value)} className={inputClass} placeholder="Full address of the venue" />
        </div>
      </div>

      <div>
        <div className={sectionTitle}>Event days, meals &amp; menu</div>
        <p className="mb-2 text-xs text-text-muted">One block for each day of the event (1 day, or 3-5 days for a conference): date, times, meals, service type, pax and menu. Use &quot;Add next day&quot; to copy the previous day.</p>
        <EventDaysEditor days={days} onChange={setDays} secondService={false} secondChoice mealRequired endTime />
      </div>

      <CustomerNeedsSection value={needs} onChange={setNeeds} daysTotal={daysTotal}>
        <div>
          <div className={sectionTitle}>Attachments (optional)</div>
          <p className="mb-2 text-xs text-text-muted">Menu references, floor plans or the customer&apos;s brief: up to {MAX_ATTACHMENTS} files, PDF, photo, Word or Excel, each smaller than 10 MB. Only the office can open them.</p>
          {files.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-[13px]">
                  <span className="truncate text-text">{f.name} <span className="text-xs text-text-muted">({sizeText(f.size)})</span></span>
                  <button type="button" onClick={() => setFiles((list) => list.filter((_, idx) => idx !== i))} className="ml-3 text-xs font-semibold text-danger">Remove</button>
                </li>
              ))}
            </ul>
          )}
          {files.length < MAX_ATTACHMENTS && (
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-border-strong bg-surface px-3 py-2 text-[12.5px] font-semibold text-primary">
              + Attach files
              <input type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </CustomerNeedsSection>

      {/* hidden honeypot field: people never see or fill it */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website</label>
        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
      </div>

      <button type="submit" disabled={step !== "idle"} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
        {step === "uploading" ? "Uploading attachments..." : step === "saving" ? "Sending..." : "Send quotation request"}
      </button>
    </form>
  );
}
