"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { requestAttachmentUpload, submitQuotationRequest } from "@/lib/catering/quotationRequestActions";
import { EVENT_TYPE_OPTIONS, ACTIVE_SALES_AGENTS } from "@/lib/catering/constants";
import { dayAmount, type EventDay } from "@/lib/catering/days";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_BUCKET,
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MAX_BYTES,
  MAX_ATTACHMENTS,
  REQUIREMENT_FIELDS,
  additionalServiceLines,
  attachmentExtension,
  unansweredAdditionalServices,
  type AdditionalServices,
  type ExtraItem,
  type QuotationRequestInput,
  type RequestAttachment,
  type RequestRequirements,
} from "@/lib/catering/quotationRequest";
import { EventDaysEditor, emptyDay } from "@/components/catering/EventDaysEditor";
import { AdditionalServicesEditor, ExtraItemsEditor, type ExtraRow } from "@/components/catering/QuotationRequestExtras";
import { ChoiceSelect } from "@/components/ui/ChoiceSelect";
import { formatPrice } from "@/lib/format";

const AGENT_OPTIONS = ACTIVE_SALES_AGENTS.map((a) => ({ value: a, label: a }));
const TYPE_OPTIONS = EVENT_TYPE_OPTIONS.map(([value, label]) => ({ value, label }));

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const areaClass =
  "mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";
const sectionTitle = "text-[14px] font-extrabold text-text";

type Header = Omit<QuotationRequestInput, "days" | "extraItems" | "additional" | "requirements" | "attachments">;

const emptyHeader: Header = {
  salesAgent: "",
  customerName: "",
  eventName: "",
  eventType: "",
  location: "",
  picName: "",
  picPhone: "",
  contactEmail: "",
  companyAddress: "",
  eventAddress: "",
  kitchenSetup: "",
  cateringSetup: "",
  remarks: "",
  website: "",
};

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function PublicQuotationForm({ companySlug }: { companySlug: string }) {
  const [form, setForm] = useState<Header>(emptyHeader);
  const [days, setDays] = useState<EventDay[]>([emptyDay()]);
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [additional, setAdditional] = useState<AdditionalServices>(unansweredAdditionalServices());
  const [requirements, setRequirements] = useState<RequestRequirements>({});
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ name: string; code?: string; warning?: string } | null>(null);

  function set<K extends keyof Header>(key: K, value: Header[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const extrasTotal = useMemo(() => extras.reduce((t, r) => t + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0), [extras]);
  const daysTotal = days.reduce((t, d) => t + dayAmount(d), 0);
  const additionalTotal = additionalServiceLines(additional).reduce((t, i) => t + i.quantity * i.unitPrice, 0);

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
      const extraItems: ExtraItem[] = extras.map((r) => ({ itemName: r.itemName, quantity: Number(r.quantity) || 0, unitPrice: Number(r.unitPrice) || 0 }));
      const result = await submitQuotationRequest(companySlug, { ...form, days, extraItems, additional, requirements, attachments });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
      } else {
        setSent({ name: form.eventName, code: result.requestCode, warning: result.warning });
        // keep the sales agent selected so several requests can be sent one after another
        setForm({ ...emptyHeader, salesAgent: form.salesAgent });
        setDays([emptyDay()]);
        setExtras([]);
        setAdditional(unansweredAdditionalServices());
        setRequirements({});
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

      <div>
        <label className={labelClass}>Sales agent *</label>
        <ChoiceSelect required value={form.salesAgent} onChange={(v) => set("salesAgent", v)} options={AGENT_OPTIONS} placeholder="Search and choose your name" className={inputClass} />
      </div>

      <div className={sectionTitle}>Customer information</div>
      <div>
        <label className={labelClass}>Customer / company name *</label>
        <input required maxLength={200} value={form.customerName} onChange={(e) => set("customerName", e.target.value)} className={inputClass} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Contact person (PIC) *</label>
          <input required maxLength={200} value={form.picName} onChange={(e) => set("picName", e.target.value)} className={inputClass} placeholder="Person in charge" />
        </div>
        <div>
          <label className={labelClass}>Contact number *</label>
          <input required type="tel" inputMode="tel" maxLength={50} value={form.picPhone} onChange={(e) => set("picPhone", e.target.value)} className={inputClass} placeholder="e.g. 012-3456789" />
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

      <div className={sectionTitle}>Event information</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className={labelClass}>Event name *</label>
          <input required maxLength={200} value={form.eventName} onChange={(e) => set("eventName", e.target.value)} className={inputClass} placeholder="e.g. Annual Conference 2026" />
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

      <div>
        <div className={sectionTitle}>Menu &amp; catering requirements</div>
        <p className="mb-2 text-xs text-text-muted">Optional: write what the customer asked for, in their words.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Number of menu options</label>
            <input
              type="number"
              min="1"
              max="20"
              step="1"
              value={requirements.menuOptions ?? ""}
              onChange={(e) => setRequirements((r) => ({ ...r, menuOptions: e.target.value ? Number(e.target.value) : undefined }))}
              className={inputClass}
              placeholder="e.g. 2"
            />
          </div>
          {REQUIREMENT_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={labelClass}>{f.label}</label>
              <textarea maxLength={1000} value={requirements[f.key] ?? ""} onChange={(e) => setRequirements((r) => ({ ...r, [f.key]: e.target.value }))} className={areaClass} placeholder={f.placeholder} />
            </div>
          ))}
        </div>
      </div>

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

      <div>
        <div className={sectionTitle}>Additional requirement (answer each one) *</div>
        <p className="mb-2 text-xs text-text-muted">Search and choose for each one: Yes (add the price if you know it), No, or Included in the food price. Each Yes is added to the quotation; Included means it is already in the price of the food.</p>
        <AdditionalServicesEditor value={additional} onChange={setAdditional} />
      </div>

      <div>
        <div className={sectionTitle}>Other extra items (optional)</div>
        <p className="mb-2 text-xs text-text-muted">Anything else to quote, e.g. equipment hire, service charge.</p>
        <ExtraItemsEditor rows={extras} onChange={setExtras} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Kitchen set-up</label>
          <textarea maxLength={2000} value={form.kitchenSetup} onChange={(e) => set("kitchenSetup", e.target.value)} className={areaClass} placeholder="What the kitchen must prepare / set up" />
        </div>
        <div>
          <label className={labelClass}>Catering set-up</label>
          <textarea maxLength={2000} value={form.cateringSetup} onChange={(e) => set("cateringSetup", e.target.value)} className={areaClass} placeholder="Tables, buffet line, equipment, staff on site" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Additional remarks</label>
        <textarea maxLength={2000} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className={areaClass} />
      </div>

      <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-[13px] text-text-secondary">
        Estimated total: <span className="text-[15px] font-extrabold text-text">{formatPrice(daysTotal + extrasTotal + additionalTotal)}</span>
        <span className="ml-2 text-xs text-text-muted">(first choice for all days + additional requirement + extra items; the office confirms the final quotation in AutoCount)</span>
      </div>

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
