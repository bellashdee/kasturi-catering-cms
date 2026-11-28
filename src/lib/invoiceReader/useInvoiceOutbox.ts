"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { uploadDocument } from "@/lib/documents/upload";
import { detectFormat, sha256Hex, STORAGE_FILE_TYPE } from "./detect";
import { registerAiInvoiceUpload } from "./actions";

/**
 * The AI invoice reader's own small offline outbox (IndexedDB "ai-invoice-outbox", separate from the app-wide offline
 * outbox so the two never touch each other's data). A file chosen while offline is kept on the device as PENDING UPLOAD;
 * once the device is online it is uploaded and becomes PENDING AI PROCESSING (a queued job). Nothing is ever shown as read
 * until the server has read it.
 *
 * Integration point for the app-wide offline / sync indicator: count = `pendingCount`, and the window event
 * "ai-invoice-outbox-changed" fires whenever it changes (detail = { pending }).
 */

export type OutboxItem = {
  id: string;
  companyId: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
  state: "pending_upload" | "uploading" | "error";
  error: string | null;
  blob: Blob;
};

const DB_NAME = "ai-invoice-outbox";
const STORE = "files";
export const OUTBOX_EVENT = "ai-invoice-outbox-changed";
const MAX_BYTES = 25 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

const listAll = () => tx<OutboxItem[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>);
const put = (item: OutboxItem) => tx("readwrite", (s) => s.put(item));
const remove = (id: string) => tx("readwrite", (s) => s.delete(id));

export type UploadResult = { name: string; ok: boolean; jobId?: string; error?: string; warning?: string; queuedOffline?: boolean };

/** Uploads one file and puts it in the reading queue. */
export async function uploadInvoiceFile(companyId: string, file: Blob & { name: string }, clientUploadId: string | null): Promise<UploadResult> {
  if (file.size === 0) return { name: file.name, ok: false, error: `${file.name} is empty (0 bytes). Copy or download it again.` };
  if (file.size > MAX_BYTES) return { name: file.name, ok: false, error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the 25 MB limit. Compress or split it first.` };
  const buffer = await file.arrayBuffer();
  const detected = detectFormat(new Uint8Array(buffer), file.name);
  if (detected.format === "unsupported") return { name: file.name, ok: false, error: `${file.name} is not a PDF, photo, XML, Excel or Word file (its content was checked, not only its name).` };
  const sha = await sha256Hex(buffer);
  const asFile = file instanceof File ? file : new File([file], file.name, { type: detected.mime });
  const doc = await uploadDocument({ companyId, module: "supplier-procurement", fileType: STORAGE_FILE_TYPE[detected.format], file: asFile, skipMarkdown: true });
  const reg = await registerAiInvoiceUpload({ companyId, documentId: doc.id, filename: file.name, sha256: sha, size: file.size, detectedFormat: detected.format, mime: detected.mime, clientUploadId });
  if (!reg.ok) return { name: file.name, ok: false, error: reg.error };
  const warning = reg.sameFileJobs.length ? `The same file was uploaded before (${reg.sameFileJobs.map((j) => j.filename).join(", ")}). It is marked as a possible duplicate.` : detected.extensionMismatch ?? undefined;
  return { name: file.name, ok: true, jobId: reg.jobId, warning };
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useInvoiceOutbox(onUploaded?: () => void) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const draining = useRef(false);
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  const refresh = useCallback(async () => {
    try {
      const all = await listAll();
      setItems(all.sort((a, b) => a.addedAt.localeCompare(b.addedAt)));
      window.dispatchEvent(new CustomEvent(OUTBOX_EVENT, { detail: { pending: all.length } }));
    } catch {
      setItems([]);
    }
  }, []);

  const drain = useCallback(async () => {
    if (draining.current || !navigator.onLine) return;
    draining.current = true;
    try {
      for (const item of await listAll()) {
        if (!navigator.onLine) break;
        await put({ ...item, state: "uploading", error: null });
        await refresh();
        try {
          const file = new File([item.blob], item.name, { type: item.type });
          const res = await uploadInvoiceFile(item.companyId, file, item.id);
          if (res.ok) await remove(item.id);
          else await put({ ...item, state: "error", error: res.error ?? "Upload failed." });
        } catch (err) {
          await put({ ...item, state: navigator.onLine ? "error" : "pending_upload", error: navigator.onLine ? (err instanceof Error ? err.message : "Upload failed.") : null });
        }
        await refresh();
      }
      onUploadedRef.current?.();
    } finally {
      draining.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    // reads the device's outbox (an external store) once, then sends what is waiting
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().then(() => drain());
    const up = () => void drain();
    window.addEventListener("online", up);
    return () => window.removeEventListener("online", up);
  }, [drain, refresh]);

  /** Keeps files on the device until they can be uploaded (used when offline, or when an upload fails for lack of network). */
  const enqueue = useCallback(
    async (companyId: string, files: File[]) => {
      for (const f of files) {
        await put({ id: crypto.randomUUID(), companyId, name: f.name, type: f.type, size: f.size, addedAt: new Date().toISOString(), state: "pending_upload", error: null, blob: f });
      }
      await refresh();
    },
    [refresh],
  );

  const discard = useCallback(async (id: string) => {
    await remove(id);
    await refresh();
  }, [refresh]);

  return { items, online, enqueue, drain, discard, pendingCount: items.length };
}
