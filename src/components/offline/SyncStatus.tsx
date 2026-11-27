"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Dialog, BTN_SM, BTN_SM_GHOST } from "@/components/priority/ui";
import { discardItem, listConflicts, listOutbox, resolveConflictItem, retryItem, runSync, syncStore } from "@/lib/offline/sync";
import type { ConflictItem, OutboxItem } from "@/lib/offline/db";
import { InstallGuide } from "./InstallGuide";

type Tone = "online" | "offline" | "syncing" | "failed";

const TONE: Record<Tone, { dot: string; pill: string; label: string }> = {
  online: { dot: "bg-success", pill: "bg-success-bg text-success", label: "ONLINE" },
  offline: { dot: "bg-text-muted", pill: "bg-[#eef0f3] text-text-secondary", label: "OFFLINE" },
  syncing: { dot: "bg-primary animate-pulse", pill: "bg-info-bg text-primary", label: "SYNCING" },
  failed: { dot: "bg-danger", pill: "bg-danger-bg text-danger", label: "SYNC FAILED" },
};

/** Fields of a saved record that mean something to the person (ids and internal columns are left out). */
const HIDDEN = new Set(["id", "company_id", "created_by", "created_at", "document_id", "extra_document_ids", "shared_company_ids"]);

function when(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * The connection and sync state, on every signed-in page: ONLINE / OFFLINE / SYNCING / SYNC FAILED, with the last successful sync,
 * what waits, what failed, the conflicts to decide, SYNC NOW, and how to install the app.
 */
export function SyncStatus() {
  const { t, locale } = useI18n();
  const s = useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.server);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const tone: Tone = !s.online ? "offline" : s.syncing ? "syncing" : s.failed + s.conflicts > 0 || s.signedOut ? "failed" : "online";
  const waiting = s.pending + s.failed;

  const load = useCallback(async () => {
    setItems(await listOutbox().catch(() => []));
    setConflicts(await listConflicts().catch(() => []));
  }, []);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void Promise.all([listOutbox().catch(() => []), listConflicts().catch(() => [])]).then(([a, b]) => {
      if (!live) return;
      setItems(a);
      setConflicts(b);
    });
    return () => {
      live = false;
    };
  }, [open, s.pending, s.failed, s.conflicts, s.syncing]);

  // offline: when the copy of this page was saved
  useEffect(() => {
    if (s.online || !navigator.serviceWorker?.controller) return;
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => setSavedAt((e.data as { savedAt?: string | null })?.savedAt ?? null);
    navigator.serviceWorker.controller.postMessage({ type: "kcms-page-saved-at", url: location.href }, [channel.port2]);
  }, [s.online]);

  async function act(key: string, work: () => Promise<void>) {
    setBusy(key);
    try {
      await work();
    } finally {
      setBusy(null);
      await load();
    }
  }

  const look = TONE[tone];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("Connection and sync")}
        title={t("Connection and sync")}
        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-bold tracking-wide ${look.pill}`}
      >
        <span className={`h-2 w-2 rounded-full ${look.dot}`} aria-hidden />
        <span className="hidden md:inline">{t(look.label)}</span>
        {waiting + s.conflicts > 0 && <span className="rounded-full bg-surface px-1.5 text-[11px] text-text">{waiting + s.conflicts}</span>}
      </button>

      {!s.online && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-text px-4 py-2 text-center text-[12.5px] font-semibold text-white print:hidden" role="status">
          {t("You are offline.")} {savedAt && !s.online ? t(`This is the copy saved on ${when(savedAt, locale)}.`) : ""} {t("Changes you can make offline are kept on this device and sent when the connection is back.")}
        </div>
      )}

      {open && (
        <Dialog title={t("Connection and sync")} onClose={() => setOpen(false)} wide>
          <div className="flex flex-col gap-4 text-[13.5px]">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Status" value={t(look.label)} />
              <Stat label="Last successful sync" value={when(s.lastSyncAt, locale)} />
              <Stat label="Waiting to send" value={String(s.pending)} />
              <Stat label="Failed" value={String(s.failed + s.conflicts)} danger={s.failed + s.conflicts > 0} />
            </div>

            {s.signedOut && <p className="rounded-lg bg-warning-bg px-3 py-2 font-semibold text-warning">{t("Your session has ended. Sign in again to send the changes kept on this device.")}</p>}
            {s.lastError && !s.signedOut && <p className="rounded-lg bg-danger-bg px-3 py-2 text-danger">{t(s.lastError)}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={BTN_SM} disabled={s.syncing} onClick={() => void runSync(true)}>
                {s.syncing ? t("Syncing...") : t("SYNC NOW")}
              </button>
              <span className="text-[12.5px] text-text-secondary">{t("Changes are also sent by themselves when the connection is back and when the app is opened.")}</span>
            </div>

            {conflicts.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-[14px] font-bold text-danger">{t("Conflicts to decide")}</h3>
                <p className="text-[12.5px] text-text-secondary">{t("Somebody else changed these records while you were offline. Nothing was overwritten: both versions are kept until you choose.")}</p>
                {conflicts.map((c) => (
                  <div key={c.id} className="rounded-lg border border-danger/40 p-3">
                    <div className="font-bold text-text">{t(c.label.title)}</div>
                    {c.label.detail && <div className="text-[12.5px] text-text-secondary">{c.label.detail}</div>}
                    <div className="mt-1 text-[12.5px] text-danger">{t(c.message)}</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Version title={t("Your change (made offline)")} subtitle={when(c.mutation.createdAt, locale)} row={c.mutation.payload} />
                      <Version title={t("Saved version now")} subtitle={when((c.serverVersion?.updated_at as string | undefined) ?? null, locale)} row={c.serverVersion} empty={t("Deleted")} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {c.serverVersion && (
                        <button type="button" className={BTN_SM} disabled={busy !== null} onClick={() => void act(c.id, () => resolveConflictItem(c.id, "mine"))}>
                          {t("Keep mine")}
                        </button>
                      )}
                      <button type="button" className={BTN_SM_GHOST} disabled={busy !== null} onClick={() => void act(c.id, () => resolveConflictItem(c.id, "server"))}>
                        {t("Keep the saved version")}
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-[14px] font-bold text-text">{t("Changes kept on this device")}</h3>
              {items.length === 0 ? (
                <p className="text-[12.5px] text-text-secondary">{t("Nothing is waiting. Everything made on this device has been saved.")}</p>
              ) : (
                items.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-text">{t(i.label.title)}</div>
                      {i.label.detail && <div className="text-[12.5px] text-text-secondary">{i.label.detail}</div>}
                      <div className="text-[12px] text-text-muted">
                        {t("Made")} {when(i.createdAt, locale)} · {i.status === "pending" ? t("Waiting to send") : i.status === "failed" ? t("Will be tried again") : t("Not accepted by the server")}
                      </div>
                      {i.lastError && <div className="text-[12px] text-danger">{t(i.lastError)}</div>}
                    </div>
                    <div className="flex gap-1.5">
                      {i.status !== "pending" && (
                        <button type="button" className={BTN_SM_GHOST} disabled={busy !== null} onClick={() => void act(i.id, () => retryItem(i.id))}>
                          {t("Try again")}
                        </button>
                      )}
                      <button
                        type="button"
                        className={BTN_SM_GHOST}
                        disabled={busy !== null}
                        onClick={() => {
                          if (window.confirm(t("Discard this change? It was never saved and cannot be brought back."))) void act(i.id, () => discardItem(i.id));
                        }}
                      >
                        {t("Discard")}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>

            <InstallGuide />
          </div>
        </Dialog>
      )}
    </>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-border bg-surface-alt px-3 py-2">
      <div className="text-[11.5px] font-semibold text-text-secondary">{t(label)}</div>
      <div className={`text-[14px] font-bold ${danger ? "text-danger" : "text-text"}`}>{value}</div>
    </div>
  );
}

function Version({ title, subtitle, row, empty }: { title: string; subtitle: string; row: Record<string, unknown> | null; empty?: string }) {
  const entries = row ? Object.entries(row).filter(([k, v]) => !HIDDEN.has(k) && !k.startsWith("_") && v !== null && v !== "" && typeof v !== "object") : [];
  return (
    <div className="rounded-md bg-surface-alt p-2">
      <div className="text-[12px] font-bold text-text">{title}</div>
      <div className="text-[11.5px] text-text-muted">{subtitle}</div>
      {row ? (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-[12px]">
          {entries.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-text-secondary">{k.replace(/_/g, " ")}</dt>
              <dd className="break-words text-text">{String(v).startsWith("att:") ? "(photo)" : String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="mt-1 text-[12px] font-semibold text-danger">{empty}</div>
      )}
    </div>
  );
}
