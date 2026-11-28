/**
 * Offline queue: the shapes shared by the browser (IndexedDB outbox, sync engine) and the server (POST /api/sync).
 * Nothing here may import server-only or browser-only code.
 */

/** Every change that may be made without a connection. Anything else stays online only (see docs/offline-first-plan.md). */
export const OFFLINE_OPS = ["wastage.create", "wastage.update", "wastage.delete", "delivery.setStatus", "opPettyCash.create"] as const;
export type OfflineOp = (typeof OFFLINE_OPS)[number];
export const isOfflineOp = (op: unknown): op is OfflineOp => typeof op === "string" && (OFFLINE_OPS as readonly string[]).includes(op);

/** A file chosen offline is kept in IndexedDB and referred to in the payload as "att:<attachment id>" until it is uploaded. */
export const ATTACHMENT_PREFIX = "att:";

/** The version of the record the person started from: the server compares it with the record now, to find a conflict. */
export type MutationBase = { updatedAt?: string | null; status?: string | null; snapshot?: Record<string, unknown> | null } | null;

/** One change as it is sent to the server. `id` is the idempotency key, made on the device when the change was made. */
export type Mutation = {
  id: string;
  op: OfflineOp;
  /** the record the change is for (a new record gets this id, so a replay can never make a second one) */
  recordId: string;
  companyId: string | null;
  payload: Record<string, unknown>;
  base: MutationBase;
  userId: string;
  deviceId: string;
  /** when the person made the change on the device (ISO) */
  createdAt: string;
  /** "Keep mine" after a conflict: apply over the version the person has now seen */
  force?: boolean;
};

export type MutationOutcome =
  | { id: string; status: "applied"; recordId?: string }
  /** the server had already applied this exact change (sent before, answer lost): nothing was done twice */
  | { id: string; status: "duplicate"; recordId?: string }
  /** somebody else changed or deleted the record meanwhile: nothing was overwritten, both versions are kept */
  | { id: string; status: "conflict"; serverVersion: Record<string, unknown> | null; message: string }
  /** the server refused it (no permission, not valid any more): it stays on the device until the person retries or drops it */
  | { id: string; status: "rejected"; error: string }
  /** a passing problem (server busy, database unreachable): tried again later */
  | { id: string; status: "retry"; error: string };

export type SyncRequest = { deviceId: string; mutations: Mutation[] };
export type SyncResponse = { outcomes: MutationOutcome[] };

/** The one-line description of a queued change shown in the pending list (written in English; the page translates it). */
export type OutboxLabel = { title: string; detail?: string };
