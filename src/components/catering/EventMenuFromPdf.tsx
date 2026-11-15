"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { uploadDocument } from "@/lib/documents/upload";
import { readPdfLines, type MenuFromPdf } from "@/lib/catering/menuPdf";
import { readMenuFromPdfText, saveMenuFromPdf } from "@/lib/catering/menuPdfActions";

type Day = { id: string; date: string; label: string; hasMenu: boolean };
type Part = { label: string | null; date: string | null; pax: number | null; text: string; target: string };

/** Where a part of the document goes by default: the day with the same date, else the day in the same place, else the first day. */
function defaultTarget(days: Day[], index: number, count: number, date: string | null): string {
  if (days.length === 0) return "event";
  const sameDate = date ? days.find((d) => d.date === date) : undefined;
  if (sameDate) return sameDate.id;
  if (count === days.length) return days[index].id;
  return days[Math.min(index, days.length - 1)].id;
}

/**
 * Upload the final quotation / invoice (the PDF from AutoCount): its menu is read, shown here to check and correct, then saved as the
 * event's menu. The kitchen's purchase request takes its dishes from that menu.
 */
export function EventMenuFromPdf({ eventId, companyId, days, hasEventMenu }: { eventId: string; companyId: string; days: Day[]; hasEventMenu: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"idle" | "reading" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [doc, setDoc] = useState<Pick<MenuFromPdf, "documentType" | "documentNumber"> | null>(null);
  const [parts, setParts] = useState<Part[]>([]);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setError("Choose a PDF file (the quotation or invoice saved from AutoCount).");
      return;
    }
    setError(null);
    setDone(null);
    setFileName(file.name);
    setStep("reading");
    try {
      const lines = await readPdfLines(await file.arrayBuffer());
      const text = lines.join("\n");
      if (text.replace(/\s/g, "").length < 20) throw new Error("This PDF has no text to read (it may be a scan or a photo). Upload the PDF saved from AutoCount.");
      // the PDF is kept with the event while its menu is read
      const [uploaded, read] = await Promise.all([
        uploadDocument({ companyId, module: "catering_menu", fileType: "pdf", file, skipMarkdown: true }).catch(() => null),
        readMenuFromPdfText({ eventId, text }),
      ]);
      if (!read.ok) throw new Error(read.error);
      setDocumentId(uploaded?.id ?? null);
      setDoc({ documentType: read.menu.documentType, documentNumber: read.menu.documentNumber });
      setParts(
        read.menu.sections.map((s, i) => ({
          label: s.label,
          date: s.date,
          pax: s.pax,
          text: s.items.join("\n"),
          target: defaultTarget(days, i, read.menu.sections.length, s.date),
        })),
      );
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The PDF could not be read. Try again.");
      setStep("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    setError(null);
    setStep("saving");
    try {
      const r = await saveMenuFromPdf({
        eventId,
        documentId,
        documentNumber: doc?.documentNumber ?? null,
        targets: parts.filter((p) => p.target !== "skip").map((p) => ({ target: p.target, items: p.text.split("\n") })),
      });
      if (!r.ok) {
        setError(r.error);
        setStep("review");
        return;
      }
      setDone("The menu is saved. The kitchen will use it when making the purchase request for this event.");
      setParts([]);
      setStep("idle");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setStep("review");
    }
  }

  const targets = [
    ...(days.length === 0 ? [{ value: "event", label: hasEventMenu ? "Event menu (replaces the current menu)" : "Event menu" }] : days.map((d) => ({ value: d.id, label: d.hasMenu ? `${d.label} (replaces its menu)` : d.label }))),
    { value: "skip", label: "Leave out" },
  ];
  const busy = step === "reading" || step === "saving";
  const input = "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-primary";

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="text-text-secondary">
        Upload the final quotation or invoice (the PDF from AutoCount). The menu is read from it for you to check, then saved as this event&apos;s menu. The kitchen uses this menu to list the ingredients and the quantities to buy.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
          {step === "reading" ? "Reading the menu..." : "Upload quotation / invoice PDF"}
        </button>
        {fileName && step !== "idle" && <span className="text-text-muted">{fileName}</span>}
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-4 py-3 text-danger">
          {error}
        </div>
      )}
      {done && <div className="rounded-lg bg-success-bg px-4 py-3 text-success">{done}</div>}

      {(step === "review" || step === "saving") && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-alt p-4">
          <div className="font-bold text-text">
            Check the menu read from {doc?.documentNumber ?? fileName}
            {doc?.documentType === "quotation" ? " (quotation)" : doc?.documentType === "invoice" ? " (invoice)" : ""}
          </div>
          <p className="text-text-secondary">Correct any dish (one dish on each line) and choose where each part goes. Nothing is saved until you press Save menu.</p>
          {parts.map((p, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-text">
                  {p.label ?? `Menu ${i + 1}`}
                  <span className="ml-2 font-normal text-text-muted">{[p.date, p.pax ? `${p.pax} pax` : null].filter(Boolean).join(" · ")}</span>
                </div>
                <label className="flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
                  Put into
                  <Select value={p.target} onChange={(e) => setParts((x) => x.map((y, j) => (j === i ? { ...y, target: e.target.value } : y)))} className="h-9 w-64 rounded-lg border border-border-strong bg-surface px-2 text-[13px]">
                    {targets.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </Select>
                </label>
              </div>
              <textarea
                value={p.text}
                onChange={(e) => setParts((x) => x.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))}
                rows={Math.min(14, Math.max(3, p.text.split("\n").length + 1))}
                className={input}
                aria-label={`Dishes of ${p.label ?? `menu ${i + 1}`}`}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || parts.every((p) => p.target === "skip")} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
              {step === "saving" ? "Saving..." : "Save menu"}
            </button>
            <button type="button" disabled={busy} onClick={() => { setParts([]); setStep("idle"); }} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
