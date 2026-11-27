/**
 * The offline data of one person on this device, in IndexedDB (kept through refreshes, closing the browser and restarting the device).
 * Each person has their own database, named after their user id: the app only ever opens the one of the person signed in now.
 *
 *  outbox       changes waiting to be sent (deleted only when the server has confirmed them)
 *  attachments  photos / receipts chosen offline, waiting to be uploaded
 *  conflicts    changes the server could not apply because the record changed meanwhile (both versions kept)
 *  meta         last successful sync and similar small values
 */
import type { Mutation, OutboxLabel } from "./types";

export type OutboxStatus = "pending" | "failed" | "rejected";

export type OutboxItem = Mutation & {
  label: OutboxLabel;
  status: OutboxStatus;
  attempts: number;
  /** not tried again before this time (ms): back-off after a failure */
  nextAttemptAt: number;
  lastError?: string;
  lastTriedAt?: string;
};

export type AttachmentItem = {
  id: string;
  companyId: string;
  name: string;
  type: string;
  blob: Blob;
  /** set once uploaded: a retry of the change reuses it and never uploads the file twice */
  documentId?: string;
  createdAt: string;
};

export type ConflictItem = {
  /** the id of the change */
  id: string;
  mutation: Mutation;
  label: OutboxLabel;
  serverVersion: Record<string, unknown> | null;
  message: string;
  detectedAt: string;
};

const VERSION = 1;
export const dbName = (userId: string) => `kcms-offline-${userId}`;

const opened = new Map<string, Promise<IDBDatabase>>();

export function openUserDb(userId: string): Promise<IDBDatabase> {
  const name = dbName(userId);
  let p = opened.get(name);
  if (!p) {
    p = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" }).createIndex("createdAt", "createdAt");
        if (!db.objectStoreNames.contains("attachments")) db.createObjectStore("attachments", { keyPath: "id" });
        if (!db.objectStoreNames.contains("conflicts")) db.createObjectStore("conflicts", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = () => {
        const db = req.result;
        // another tab deletes or upgrades the database (sign-out): let it go
        db.onversionchange = () => {
          db.close();
          opened.delete(name);
        };
        resolve(db);
      };
      req.onerror = () => {
        opened.delete(name);
        reject(req.error);
      };
    });
    opened.set(name, p);
  }
  return p;
}

type StoreName = "outbox" | "attachments" | "conflicts" | "meta";

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Writes are confirmed only when the transaction has completed (the data is on disk). */
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("The change could not be kept on this device."));
  });
}

export async function getAll<T>(userId: string, store: StoreName): Promise<T[]> {
  const db = await openUserDb(userId);
  return done(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function getOne<T>(userId: string, store: StoreName, key: string): Promise<T | undefined> {
  const db = await openUserDb(userId);
  return done(db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>);
}

export async function putMany(userId: string, writes: { store: StoreName; value: unknown }[], deletes: { store: StoreName; key: string }[] = []): Promise<void> {
  const db = await openUserDb(userId);
  const stores = Array.from(new Set([...writes.map((w) => w.store), ...deletes.map((d) => d.store)]));
  if (stores.length === 0) return;
  const tx = db.transaction(stores, "readwrite");
  for (const w of writes) tx.objectStore(w.store).put(w.value);
  for (const d of deletes) tx.objectStore(d.store).delete(d.key);
  await committed(tx);
}

export async function count(userId: string, store: StoreName): Promise<number> {
  const db = await openUserDb(userId);
  return done(db.transaction(store).objectStore(store).count());
}

/** Removes the whole database of a person (sign-out with nothing left to send). */
export async function deleteUserDb(userId: string): Promise<void> {
  const name = dbName(userId);
  const p = opened.get(name);
  opened.delete(name);
  if (p) (await p.catch(() => null))?.close();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

/** This device's own id (not the person's): written on every change so the server knows where it came from. */
export function deviceId(): string {
  const KEY = "kcms-device-id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}
