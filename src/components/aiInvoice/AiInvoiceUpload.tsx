"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { INVOICE_FILE_ACCEPT } from "@/lib/invoiceReader/detect";
import { uploadInvoiceFile, useInvoiceOutbox, type UploadResult } from "@/lib/invoiceReader/useInvoiceOutbox";

type Company = { id: string; name: string };

/**
 * Keeps the reading queue moving while this page is open: asks the worker to read the next waiting invoice, one per call
 * (each call fits in the server's time limit), and refreshes the list after each one. Jobs waiting for a retry are checked
 * again every 30 seconds.
 */
export function AiInvoiceQueueRunner({ waiting }: { waiting: number }) {
  const router = useRouter();
  const running = useRef(false);
  const [state, setState] = useState<"idle" | "working" | "offline">("idle");

  useEffect(() => {
    if (waiting === 0) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function loop() {
      if (stopped) return;
      if (running.current) {
        // an earlier round (from before the list refreshed) is still finishing its call
        timer = setTimeout(loop, 3_000);
        return;
      }
      if (!navigator.onLine) {
        setState("offline");
        timer = setTimeout(loop, 15_000);
        return;
      }
      running.current = true;
      setState("working");
      try {
        for (let i = 0; i < 50 && !stopped; i++) {
          const res = await fetch("/api/ai-invoice/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          const body = (await res.json().catch(() => null)) as { idle?: boolean; again?: boolean } | null;
          router.refresh();
          if (!res.ok || !body || body.idle) break;
        }
      } catch {
        // network: tried again on the next round
      } finally {
        running.current = false;
        setState("idle");
      }
      if (!stopped) timer = setTimeout(loop, 30_000);
    }
    void loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [waiting, router]);

  if (waiting === 0 && state === "idle") return null;
  return (
    <div className={`rounded-xl border px-4 py-2.5 text-[13px] font-semibold ${state === "offline" ? "border-warning bg-warning/10 text-warning" : "border-primary/30 bg-primary/5 text-primary"}`}>
      {state === "offline"
        ? `Offline: ${waiting} invoice${waiting === 1 ? " is" : "s are"} waiting and will be read when the connection is back. Nothing has been read yet.`
        : `${waiting} invoice${waiting === 1 ? " is" : "s are"} in the reading queue. Keep this page open; each one takes up to a minute.`}
    </div>
  );
}

export function AiInvoiceUploadPanel({ companies, defaultCompanyId }: { companies: Company[]; defaultCompanyId: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const outbox = useInvoiceOutbox(() => router.refresh());

  async function send() {
    if (!companyId) {
      setResults([{ name: "", ok: false, error: "Choose the company the invoices belong to." }]);
      return;
    }
    if (!files.length) return;
    setBusy(true);
    setResults([]);
    // offline: the files stay on this device as PENDING UPLOAD and go up on their own when the connection is back
    if (!navigator.onLine) {
      await outbox.enqueue(companyId, files);
      setResults(files.map((f) => ({ name: f.name, ok: true, queuedOffline: true })));
      setFiles([]);
      setBusy(false);
      return;
    }
    const out: UploadResult[] = [];
    for (const f of files) {
      try {
        out.push(await uploadInvoiceFile(companyId, f, null));
      } catch (err) {
        if (!navigator.onLine) {
          await outbox.enqueue(companyId, [f]);
          out.push({ name: f.name, ok: true, queuedOffline: true });
        } else out.push({ name: f.name, ok: false, error: err instanceof Error ? err.message : "Upload failed." });
      }
      setResults([...out]);
    }
    setFiles([]);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[16rem_1fr]">
        <div>
          <label className="block text-[12.5px] font-semibold text-text-secondary">Company *</label>
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm">
            <option value="">Choose the company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <p className="mt-1.5 text-[12px] text-text-muted">The company that received the invoices. The reader checks the printed Bill To against it and warns when they differ; it never changes it.</p>
        </div>
        <div>
          <label className="block text-[12.5px] font-semibold text-text-secondary">Invoice files</label>
          <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-strong bg-surface-alt px-4 py-8 text-center hover:border-primary">
            <input type="file" multiple accept={INVOICE_FILE_ACCEPT} className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <span className="text-[13.5px] font-semibold text-text">{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} chosen` : "Click to choose invoices"}</span>
            <span className="mt-1 text-[12px] text-text-muted">PDF (also scanned, many pages), photo, WhatsApp screenshot, XML e-invoice, Excel (XLS / XLSX), Word (DOCX)</span>
          </label>
          {files.length > 0 && (
            <ul className="mt-2 text-[12.5px] text-text-secondary" translate="no">
              {files.map((f) => (
                <li key={f.name + f.size}>{f.name} · {(f.size / 1024).toFixed(0)} KB</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={send} disabled={busy || files.length === 0} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {busy ? "Uploading…" : outbox.online ? "Upload & add to reading queue" : "Keep on this device (offline)"}
        </button>
        {!outbox.online && <span className="text-[12.5px] font-semibold text-warning">You are offline. Files are kept on this device as Pending upload and sent when the connection is back.</span>}
      </div>

      {results.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 text-[13px]">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? (r.warning ? "text-warning" : "text-success") : "text-danger"}>
              <span translate="no">{r.name}</span>{" "}
              {r.ok ? (r.queuedOffline ? "— pending upload (offline)" : `— in the reading queue${r.warning ? `. ${r.warning}` : ""}`) : `— ${r.error}`}
            </li>
          ))}
        </ul>
      )}

      {outbox.items.length > 0 && (
        <div className="mt-5 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <div className="text-[13px] font-bold text-text">{`Waiting on this device: ${outbox.items.length}`}</div>
          <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px]">
            {outbox.items.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-2">
                <span translate="no">{it.name}</span>
                <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] font-bold text-text-secondary">
                  {it.state === "uploading" ? "Uploading" : it.state === "error" ? "Upload failed" : "Pending upload"}
                </span>
                {it.error && <span className="text-danger">{it.error}</span>}
                <button onClick={() => outbox.discard(it.id)} className="text-[12px] font-semibold text-danger">Remove</button>
              </li>
            ))}
          </ul>
          {outbox.online && (
            <button onClick={() => outbox.drain()} className="mt-2 text-[12.5px] font-semibold text-primary">Upload now</button>
          )}
        </div>
      )}
    </div>
  );
}
