/**
 * The offline queue and the sync engine (browser only).
 *
 * A change made without a connection is written to the person's own IndexedDB outbox (with its photos), and stays there through
 * refreshes, closing the browser and restarting the device. It is sent to POST /api/sync when the connection is back: at app open,
 * when the device goes online, when the app comes back to the foreground, every minute while something waits, on SYNC NOW, and by
 * Background Sync where the browser has it. An item is removed only when the server confirms it.
 */
import { uploadReceipt } from "@/lib/documents/upload";
import { ATTACHMENT_PREFIX, type Mutation, type MutationBase, type MutationOutcome, type OfflineOp, type OutboxLabel, type SyncResponse } from "./types";
import { count, deleteUserDb, deviceId, getAll, getOne, putMany, type AttachmentItem, type ConflictItem, type OutboxItem } from "./db";

export type SyncState = {
  userId: string | null;
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  conflicts: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /** the session ended while changes wait: they are sent after signing in again */
  signedOut: boolean;
};

let state: SyncState = { userId: null, online: true, syncing: false, pending: 0, failed: 0, conflicts: 0, lastSyncAt: null, lastError: null, signedOut: false };
const listeners = new Set<() => void>();
const channel: BroadcastChannel | null = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("kcms-sync") : null;

function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const syncStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,
  server: (): SyncState => SERVER_STATE,
};
const SERVER_STATE: SyncState = { ...state };

/** Something changed in the queue (here or in another tab of the same person). */
function announce() {
  channel?.postMessage({ type: "changed", userId: state.userId });
}
channel?.addEventListener("message", (e) => {
  const data = e.data as { type?: string; userId?: string };
  if (data?.type === "changed" && data.userId === state.userId) void refreshCounts();
});

export async function refreshCounts() {
  const uid = state.userId;
  if (!uid) return;
  try {
    const [items, conflicts, meta] = await Promise.all([getAll<OutboxItem>(uid, "outbox"), count(uid, "conflicts"), getOne<{ key: string; value: string }>(uid, "meta", "lastSyncAt")]);
    if (uid !== state.userId) return;
    set({
      pending: items.filter((i) => i.status === "pending").length,
      failed: items.filter((i) => i.status !== "pending").length,
      conflicts,
      lastSyncAt: meta?.value ?? null,
    });
  } catch {
    /* IndexedDB not available (private window of some browsers): the counts stay as they are */
  }
}

/** The person signed in on this page (null after sign-out). */
export function setSyncUser(userId: string | null) {
  if (state.userId === userId) return;
  set({ userId, pending: 0, failed: 0, conflicts: 0, lastSyncAt: null, lastError: null, signedOut: false });
  void refreshCounts();
}

export function setOnline(online: boolean) {
  if (state.online !== online) set({ online });
}

export const isNetworkError = (err: unknown) =>
  err instanceof TypeError || (err instanceof Error && /failed to fetch|networkerror|network error|load failed|network request failed|fetch failed|connection/i.test(err.message));

/** Whether a save should go to the queue right away (the device knows it has no connection). */
export const shouldQueue = () => (typeof navigator !== "undefined" && navigator.onLine === false) || !state.online;

// ---------------------------------------------------------------- queueing

export type QueueInput = {
  op: OfflineOp;
  recordId: string;
  companyId: string | null;
  payload: Record<string, unknown>;
  base?: MutationBase;
  label: OutboxLabel;
  /** files chosen offline: put into the payload field as "att:<id>" (a list field gets a list) */
  files?: { field: string; files: File[]; companyId: string; list?: boolean }[];
};

/** Keeps a change on this device until the server confirms it. Returns the change's id. */
export async function queueChange(input: QueueInput): Promise<string> {
  const uid = state.userId;
  if (!uid) throw new Error("Sign in again to save changes on this device.");
  const now = new Date().toISOString();
  const payload = { ...input.payload };
  const attachments: AttachmentItem[] = [];
  for (const group of input.files ?? []) {
    const refs: string[] = [];
    for (const file of group.files) {
      const id = crypto.randomUUID();
      // the file's content is copied into the database now (a File object would not survive a restart)
      attachments.push({ id, companyId: group.companyId, name: file.name, type: file.type, blob: new Blob([await file.arrayBuffer()], { type: file.type }), createdAt: now });
      refs.push(ATTACHMENT_PREFIX + id);
    }
    payload[group.field] = group.list ? refs : (refs[0] ?? null);
  }
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    op: input.op,
    recordId: input.recordId,
    companyId: input.companyId,
    payload,
    base: input.base ?? null,
    userId: uid,
    deviceId: deviceId(),
    createdAt: now,
    label: input.label,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
  };
  await putMany(uid, [...attachments.map((a) => ({ store: "attachments" as const, value: a })), { store: "outbox", value: item }]);
  await refreshCounts();
  announce();
  void registerBackgroundSync();
  void runSync();
  return item.id;
}

async function registerBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/");
    const sync = (reg as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | undefined)?.sync;
    await sync?.register("kcms-sync");
  } catch {
    /* no Background Sync (Safari, Firefox): the app sends the queue when it is opened or comes back online */
  }
}

export async function listOutbox(): Promise<OutboxItem[]> {
  if (!state.userId) return [];
  const items = await getAll<OutboxItem>(state.userId, "outbox");
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listConflicts(): Promise<ConflictItem[]> {
  if (!state.userId) return [];
  const items = await getAll<ConflictItem>(state.userId, "conflicts");
  return items.sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
}

/** "Try again" on a change the server refused (or that failed): it is sent with the next sync. */
export async function retryItem(id: string) {
  const uid = state.userId;
  if (!uid) return;
  const item = await getOne<OutboxItem>(uid, "outbox", id);
  if (!item) return;
  await putMany(uid, [{ store: "outbox", value: { ...item, status: "pending", nextAttemptAt: 0, lastError: undefined } }]);
  await refreshCounts();
  announce();
  void runSync(true);
}

/** "Discard": the person drops a change that was never applied (asked to confirm on the page). */
export async function discardItem(id: string) {
  const uid = state.userId;
  if (!uid) return;
  const item = await getOne<OutboxItem>(uid, "outbox", id);
  if (!item) return;
  await putMany(uid, [], [{ store: "outbox", key: id }, ...attachmentIds(item.payload).map((a) => ({ store: "attachments" as const, key: a }))]);
  await refreshCounts();
  announce();
}

/**
 * A conflict decided by the person. "mine": the change is sent again over the version now on the server (that version stays recorded
 * in sync_conflicts). "server": the change is dropped; it also stays recorded there.
 */
export async function resolveConflictItem(id: string, choice: "mine" | "server") {
  const uid = state.userId;
  if (!uid) return;
  const conflict = await getOne<ConflictItem>(uid, "conflicts", id);
  if (!conflict) return;
  const writes: { store: "outbox"; value: OutboxItem }[] = [];
  if (choice === "mine") {
    const server = conflict.serverVersion;
    writes.push({
      store: "outbox",
      value: {
        ...conflict.mutation,
        id: crypto.randomUUID(),
        base: { updatedAt: (server?.updated_at as string | undefined) ?? null, status: (server?.status as string | undefined) ?? null },
        force: true,
        createdAt: new Date().toISOString(),
        label: conflict.label,
        status: "pending",
        attempts: 0,
        nextAttemptAt: 0,
      },
    });
  }
  // the decision is noted on the server first; the conflict leaves this device only after that (or when the person is offline, it is kept)
  try {
    await fetch(endpoints.resolve, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mutationId: id, resolution: choice === "mine" ? "kept_mine" : "kept_server" }) });
  } catch {
    /* noted later is not possible offline; the choice itself is kept by re-queueing / dropping below */
  }
  await putMany(uid, writes, [{ store: "conflicts", key: id }, ...(choice === "server" ? attachmentIds(conflict.mutation.payload).map((a) => ({ store: "attachments" as const, key: a })) : [])]);
  await refreshCounts();
  announce();
  if (choice === "mine") void runSync(true);
}

// ---------------------------------------------------------------- sending

const attachmentIds = (payload: Record<string, unknown>): string[] =>
  Object.values(payload)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v): v is string => typeof v === "string" && v.startsWith(ATTACHMENT_PREFIX))
    .map((v) => v.slice(ATTACHMENT_PREFIX.length));

class MissingAttachment extends Error {}

/** Uploads the files of a change (once) and puts their document ids in place of the "att:" references. */
async function resolveAttachments(uid: string, item: OutboxItem): Promise<Mutation> {
  const resolve = async (value: unknown): Promise<unknown> => {
    if (typeof value !== "string" || !value.startsWith(ATTACHMENT_PREFIX)) return value;
    const att = await getOne<AttachmentItem>(uid, "attachments", value.slice(ATTACHMENT_PREFIX.length));
    if (!att) throw new MissingAttachment("A photo of this change is missing on this device. Discard the change and make it again.");
    if (att.documentId) return att.documentId;
    const file = new File([att.blob], att.name, { type: att.type });
    const documentId = await uploadReceipt(att.companyId, file);
    await putMany(uid, [{ store: "attachments", value: { ...att, documentId } }]);
    return documentId;
  };
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item.payload)) payload[k] = Array.isArray(v) ? await Promise.all(v.map(resolve)) : await resolve(v);
  const { id, op, recordId, companyId, base, userId, deviceId: device, createdAt, force } = item;
  return { id, op, recordId, companyId, payload, base, userId, deviceId: device, createdAt, force };
}

/** Where the queue is sent (only changed by the local test page of the offline feature). */
const endpoints = { sync: "/api/sync", resolve: "/api/sync/resolve" };
export function configureSyncEndpoints(next: Partial<typeof endpoints>) {
  Object.assign(endpoints, next);
}

const backoff = (attempts: number) => Math.min(30 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1)) * (0.8 + Math.random() * 0.4);

let running: Promise<void> | null = null;

/** Sends what waits. `force` also sends changes still in their back-off time (SYNC NOW). */
export function runSync(force = false): Promise<void> {
  if (running) return running;
  const uid = state.userId;
  if (!uid) return Promise.resolve();
  const work = async () => {
    // one tab of the person sends at a time
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks) await locks.request(`kcms-sync-${uid}`, { ifAvailable: true }, async (lock) => (lock ? syncOnce(uid, force) : undefined));
    else await syncOnce(uid, force);
  };
  running = work().finally(() => {
    running = null;
  });
  return running;
}

async function syncOnce(uid: string, force: boolean) {
  const now = Date.now();
  let items: OutboxItem[];
  try {
    items = (await getAll<OutboxItem>(uid, "outbox")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return;
  }
  const due = items.filter((i) => i.status !== "rejected" && (force || i.nextAttemptAt <= now));
  // the device says it has no network: nothing is tried (the changes simply wait; being offline is not a failure)
  if (navigator.onLine === false) {
    setOnline(false);
    await refreshCounts();
    return;
  }
  set({ syncing: true, lastError: null });
  let problem: string | null = null;
  let applied = 0;
  try {
    // nothing to send: only check the connection and the session
    if (due.length === 0) {
      const res = await post(uid, []);
      if (res) await markSynced(uid);
      return;
    }
    const sendable: Mutation[] = [];
    for (const item of due) {
      try {
        sendable.push(await resolveAttachments(uid, item));
      } catch (err) {
        if (isNetworkError(err)) {
          // the connection dropped while uploading: the change simply waits
          setOnline(false);
        } else {
          problem = err instanceof Error ? err.message : "A photo could not be uploaded.";
          await fail(uid, item, problem, err instanceof MissingAttachment ? "rejected" : "failed");
        }
        break; // keep the order: the changes after it wait
      }
    }
    if (sendable.length === 0) return;
    const res = await post(uid, sendable);
    if (!res) {
      // no connection: the changes wait as they are (not a failure); signed out: they wait for the person to sign in again
      if (state.signedOut) problem = "Sign in again to send the changes kept on this device.";
      else if (state.online) {
        problem = "The server could not take the changes now. They stay on this device and are tried again.";
        for (const m of sendable) {
          const item = due.find((i) => i.id === m.id);
          if (item) await fail(uid, item, problem, "failed");
        }
      }
      return;
    }
    for (const outcome of res.outcomes) {
      const item = due.find((i) => i.id === outcome.id);
      if (!item) continue;
      const r = await settle(uid, item, outcome);
      if (r === "applied") applied++;
      else problem = problem ?? (outcome.status === "conflict" ? outcome.message : "error" in outcome ? outcome.error : null);
    }
    if (!problem) await markSynced(uid);
  } finally {
    set({ syncing: false, lastError: problem });
    await refreshCounts();
    announce();
    // pages showing the saved data reload it
    if (applied > 0) window.dispatchEvent(new CustomEvent("kcms-sync-applied"));
  }
}

async function post(uid: string, mutations: Mutation[]): Promise<SyncResponse | null> {
  try {
    const res = await fetch(endpoints.sync, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
      body: JSON.stringify({ deviceId: deviceId(), mutations }),
    });
    setOnline(true);
    // signed out (or the session expired): the changes stay, they need this person to sign in again
    if (res.status === 401 || res.type === "opaqueredirect") {
      set({ signedOut: true });
      return null;
    }
    if (!res.ok) return null;
    set({ signedOut: false });
    return (await res.json()) as SyncResponse;
  } catch {
    setOnline(false);
    return null;
  }
}

async function markSynced(uid: string) {
  await putMany(uid, [{ store: "meta", value: { key: "lastSyncAt", value: new Date().toISOString() } }]);
}

async function fail(uid: string, item: OutboxItem, error: string, status: "failed" | "rejected", countAttempt = true) {
  const attempts = item.attempts + (countAttempt ? 1 : 0);
  await putMany(uid, [{ store: "outbox", value: { ...item, status, attempts, lastError: error, lastTriedAt: new Date().toISOString(), nextAttemptAt: Date.now() + (status === "failed" ? backoff(attempts) : 0) } }]);
}

async function settle(uid: string, item: OutboxItem, outcome: MutationOutcome): Promise<"applied" | "kept"> {
  switch (outcome.status) {
    case "applied":
    case "duplicate":
      // confirmed by the server: only now does the change leave this device
      await putMany(uid, [], [{ store: "outbox", key: item.id }, ...attachmentIds(item.payload).map((a) => ({ store: "attachments" as const, key: a }))]);
      return "applied";
    case "conflict": {
      const conflict: ConflictItem = { id: item.id, mutation: item, label: item.label, serverVersion: outcome.serverVersion, message: outcome.message, detectedAt: new Date().toISOString() };
      await putMany(uid, [{ store: "conflicts", value: conflict }], [{ store: "outbox", key: item.id }]);
      return "kept";
    }
    case "rejected":
      await fail(uid, item, outcome.error, "rejected");
      return "kept";
    case "retry":
      await fail(uid, item, outcome.error, "failed");
      return "kept";
  }
}

// ---------------------------------------------------------------- sign-out

/** What waits on this device for the person (shown before signing out). */
export async function unsentCount(userId: string): Promise<number> {
  try {
    return (await count(userId, "outbox")) + (await count(userId, "conflicts"));
  } catch {
    return 0;
  }
}

/**
 * Sign-out: the pages and data kept for the person are removed from this device. Changes not yet sent stay in the person's own
 * database (they are never lost) and are sent the next time they sign in here; nobody else can open them in the app.
 */
export async function clearOfflineDataForSignOut(userId: string) {
  try {
    if ((await unsentCount(userId)) === 0) await deleteUserDb(userId);
  } catch {
    /* nothing kept */
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k === `kcms-pages-${userId}`).map((k) => caches.delete(k)));
    const meta = await caches.open("kcms-meta");
    await meta.delete("/__kcms/user");
  } catch {
    /* no Cache Storage */
  }
  setSyncUser(null);
}
