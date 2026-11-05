"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMalaysiaDate, formatMalaysiaDateTime, formatPrice } from "@/lib/format";
import {
  addQuote,
  approveRequest,
  deleteDraftRequest,
  markCompleted,
  markPurchased,
  rejectRequest,
  returnToKitchen,
  saveRequestItems,
  selectQuote,
  sendForApproval,
  startReview,
  submitRequest,
} from "@/lib/kitchenPurchase/actions";
import { itemKey, KITCHEN_EDITABLE, lineTotal, STATUS_LABEL, statusTone, UNITS, type Quote, type RequestItem, type RequestStatus } from "@/lib/kitchenPurchase/shared";
import type { RequestRow, TrailEntry } from "@/lib/kitchenPurchase/queries";

const input = "h-11 w-full rounded-lg border border-border-strong bg-white px-3 text-[14px] outline-none focus:border-primary";
const btn = "h-11 rounded-lg px-4 text-[14px] font-bold disabled:opacity-60";
const primary = `${btn} bg-primary text-white hover:bg-primary-hover`;
const outline = `${btn} border border-border-strong bg-white text-text hover:border-primary hover:text-primary`;
const danger = `${btn} border border-danger text-danger hover:bg-danger-bg`;

type Draft = { key: string; id?: string; itemName: string; unit: string; quantity: string; menus: string[]; remark: string };

/** The latest offer of each supplier for one item (older offers stay in the history, but are not today's prices). */
function latestBySupplier(quotes: Quote[], key: string): Quote[] {
  const seen = new Set<string>();
  const out: Quote[] = [];
  for (const q of quotes) {
    if (q.itemKey !== key || seen.has(q.supplierId)) continue;
    seen.add(q.supplierId);
    out.push(q);
  }
  return out;
}

/**
 * One purchase request, for Kitchen and for the Purchaser. Kitchen reviews the ingredient list and writes the quantities; the Purchaser
 * chooses suppliers and enters their prices; a manager approves. What each person may do depends on the status of the request.
 */
export function RequestWorkspace({
  request,
  items,
  quotes,
  trail,
  suppliers,
  isKitchen,
  isPurchaser,
  canApprove,
}: {
  request: RequestRow;
  items: RequestItem[];
  quotes: Quote[];
  trail: TrailEntry[];
  suppliers: { id: string; name: string }[];
  isKitchen: boolean;
  isPurchaser: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const status = request.status as RequestStatus;
  const kitchenEdit = isKitchen && KITCHEN_EDITABLE.includes(status);
  const pricing = isPurchaser && status === "under_review";
  const showPrices = ["under_review", "pending_approval", "approved", "purchased", "completed"].includes(status);

  const [rows, setRows] = useState<Draft[]>(() => items.map((i) => ({ key: i.id, id: i.id, itemName: i.itemName, unit: i.unit, quantity: i.quantity === null ? "" : String(i.quantity), menus: i.menus, remark: i.remark ?? "" })));
  const [notes, setNotes] = useState(request.kitchen_notes ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [priceDraft, setPriceDraft] = useState<Record<string, { supplierId: string; price: string; note: string }>>({});

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const quoteById = useMemo(() => new Map(quotes.map((q) => [q.id, q])), [quotes]);
  const filled = rows.every((r) => r.quantity.trim() !== "" && Number(r.quantity) > 0);

  async function run(key: string, work: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const r = await work();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else {
        if (done) setMessage(done);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const payload = () => ({
    requestId: request.id,
    notes,
    items: rows.map((r) => ({ id: r.id, itemName: r.itemName, unit: r.unit, quantity: r.quantity.trim() === "" ? null : Number(r.quantity), menus: r.menus, remark: r.remark })),
  });

  const grand = items.reduce((t, i) => {
    const q = i.selectedQuoteId ? quoteById.get(i.selectedQuoteId) : undefined;
    return t + (lineTotal(i.quantity, q?.pricePerUnit ?? null) ?? 0);
  }, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-bold tracking-wide text-text-muted">{request.request_no}</div>
          <h2 className="text-[20px] font-extrabold text-text">{request.event_name}</h2>
          <div className="text-[13.5px] text-text-secondary">
            {request.event_date ? formatMalaysiaDate(request.event_date) : "—"} · {request.companies?.name ?? ""} · {items.length} item{items.length === 1 ? "" : "s"}
          </div>
        </div>
        <StatusBadge tone={statusTone(status)}>{STATUS_LABEL[status] ?? status}</StatusBadge>
      </div>

      {request.return_reason && (status === "revision_required" || status === "rejected") && (
        <div className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-[14px] text-warning">
          <b>{status === "rejected" ? "Rejected" : "Returned to Kitchen"}:</b> {request.return_reason}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-4 py-3 text-[14px] text-danger">
          {error}
        </div>
      )}
      {message && <div className="rounded-lg bg-success-bg px-4 py-3 text-[14px] text-success">{message}</div>}

      <div className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const item = r.id ? itemById.get(r.id) : undefined;
          const key = itemKey(r.itemName);
          const options = item ? latestBySupplier(quotes, key) : [];
          const selected = item?.selectedQuoteId ? quoteById.get(item.selectedQuoteId) : undefined;
          const total = item ? lineTotal(item.quantity, selected?.pricePerUnit ?? null) : null;
          const cheapest = options.length > 1 ? Math.min(...options.map((o) => o.pricePerUnit)) : null;
          const draft = item ? (priceDraft[item.id] ?? { supplierId: "", price: "", note: "" }) : { supplierId: "", price: "", note: "" };
          const lastFromSupplier = draft.supplierId ? options.find((o) => o.supplierId === draft.supplierId) : undefined;
          return (
            <div key={r.key} className="rounded-xl border border-border bg-surface p-4">
              {kitchenEdit ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem_auto]">
                  <label className="text-[12px] font-semibold text-text-secondary">
                    Item name
                    <input value={r.itemName} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, itemName: e.target.value } : y)))} className={`${input} mt-1`} />
                  </label>
                  <label className="text-[12px] font-semibold text-text-secondary">
                    Unit
                    <select value={r.unit} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, unit: e.target.value } : y)))} className={`${input} mt-1`}>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[12px] font-semibold text-text-secondary">
                    Required quantity
                    <input inputMode="decimal" value={r.quantity} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, quantity: e.target.value.replace(/[^\d.]/g, "") } : y)))} placeholder="Write it" className={`${input} mt-1`} />
                  </label>
                  <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className={`${danger} self-end`} aria-label={`Delete ${r.itemName}`}>
                    Delete
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-[16px] font-bold text-text">{r.itemName}</div>
                  <div className="text-[15px] font-semibold text-text">{r.quantity ? `${r.quantity} ${r.unit}` : `— ${r.unit}`}</div>
                </div>
              )}
              {r.menus.length > 0 && <div className="mt-2 text-[12.5px] text-text-muted">From: {r.menus.join(", ")}</div>}
              {r.remark && <div className="mt-1 text-[12.5px] text-warning">{r.remark}</div>}

              {item && showPrices && (
                <div className="mt-3 border-t border-border pt-3">
                  {options.length > 0 ? (
                    <ul className="flex flex-col gap-1.5">
                      {options.map((o) => (
                        <li key={o.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13.5px] ${item.selectedQuoteId === o.id ? "bg-info-bg" : "bg-surface-alt"}`}>
                          <span>
                            <b>{o.supplierName}</b> · {formatPrice(o.pricePerUnit)} / {o.unit} <span className="text-text-muted">· offered {formatMalaysiaDate(o.quotedOn)}</span>
                            {cheapest !== null && o.pricePerUnit === cheapest && <span className="ml-2 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-bold text-success">Lowest</span>}
                            {o.note && <span className="text-text-muted"> · {o.note}</span>}
                          </span>
                          {pricing ? (
                            item.selectedQuoteId === o.id ? (
                              <span className="text-[12px] font-bold text-primary">Chosen</span>
                            ) : (
                              <button type="button" disabled={!!busy} onClick={() => run(`sel-${item.id}`, () => selectQuote({ requestId: request.id, itemId: item.id, quoteId: o.id }))} className="rounded-md border border-border-strong bg-white px-3 py-1.5 text-[12.5px] font-bold">
                                Choose
                              </button>
                            )
                          ) : item.selectedQuoteId === o.id ? (
                            <span className="text-[12px] font-bold text-primary">Chosen</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-text-muted">No supplier price yet.</p>
                  )}
                  {selected && (
                    <div className="mt-2 text-[13.5px] text-text">
                      Estimated total: <b>{total === null ? "—" : formatPrice(total)}</b> <span className="text-text-muted">({item.quantity ?? "—"} {item.unit} × {formatPrice(selected.pricePerUnit)})</span>
                    </div>
                  )}
                  {pricing && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_9rem_1fr_auto]">
                      <select value={draft.supplierId} onChange={(e) => setPriceDraft((d) => ({ ...d, [item.id]: { ...draft, supplierId: e.target.value } }))} className={input} aria-label="Supplier">
                        <option value="">Supplier...</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <input inputMode="decimal" value={draft.price} onChange={(e) => setPriceDraft((d) => ({ ...d, [item.id]: { ...draft, price: e.target.value.replace(/[^\d.]/g, "") } }))} placeholder={`RM / ${item.unit}`} className={input} aria-label="Price per unit" />
                      <input value={draft.note} onChange={(e) => setPriceDraft((d) => ({ ...d, [item.id]: { ...draft, note: e.target.value } }))} placeholder="Note (optional)" className={input} />
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() =>
                          run(`price-${item.id}`, async () => {
                            const r = await addQuote({ requestId: request.id, itemId: item.id, supplierId: draft.supplierId, pricePerUnit: Number(draft.price), note: draft.note });
                            if (r.ok) setPriceDraft((d) => ({ ...d, [item.id]: { supplierId: "", price: "", note: "" } }));
                            return r;
                          })
                        }
                        className={primary}
                      >
                        Add price
                      </button>
                      {lastFromSupplier && (
                        <div className="text-[12px] text-text-muted sm:col-span-4">
                          Last offer from this supplier: {formatPrice(lastFromSupplier.pricePerUnit)} / {lastFromSupplier.unit} on {formatMalaysiaDate(lastFromSupplier.quotedOn)}. This is a past offer, not a confirmed quotation: enter today&apos;s price.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {kitchenEdit && (
        <button type="button" onClick={() => setRows((x) => [...x, { key: `new-${Date.now()}-${x.length}`, itemName: "", unit: "KG", quantity: "", menus: [], remark: "" }])} className={outline}>
          + Add ingredient
        </button>
      )}

      {showPrices && (
        <div className="rounded-xl bg-surface-alt px-4 py-3 text-[15px] text-text">
          Estimated purchase cost: <b>{formatPrice(grand)}</b>
          <span className="ml-2 text-[12.5px] text-text-muted">(items with a chosen supplier price only)</span>
        </div>
      )}

      {kitchenEdit ? (
        <label className="text-[12px] font-semibold text-text-secondary">
          Note for the Purchaser (optional)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-[14px] outline-none focus:border-primary" />
        </label>
      ) : (
        request.kitchen_notes && (
          <div className="rounded-lg bg-surface-alt px-4 py-3 text-[14px] text-text">
            <b>Kitchen note:</b> {request.kitchen_notes}
          </div>
        )
      )}

      {/* what the person can do now */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        {kitchenEdit && (
          <>
            {!filled && <p className="text-[13px] text-text-secondary">Write the quantity of every item. Then the request can be submitted to the Purchaser.</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!busy} onClick={() => run("save", () => saveRequestItems(payload()), "Saved.")} className={outline}>
                {busy === "save" ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                disabled={!!busy || !filled}
                onClick={() =>
                  run("submit", async () => {
                    const saved = await saveRequestItems(payload());
                    if (!saved.ok) return saved;
                    return submitRequest(request.id);
                  }, "Submitted to the Purchaser.")
                }
                className={primary}
              >
                {busy === "submit" ? "Submitting..." : "Submit to Purchaser"}
              </button>
              {(status === "draft" || status === "pending_submission") && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => {
                    if (window.confirm("Delete this purchase request?")) void run("delete", async () => {
                      const r = await deleteDraftRequest(request.id);
                      if (r.ok) router.push("/kitchen/purchase-requests");
                      return r;
                    });
                  }}
                  className={danger}
                >
                  Delete request
                </button>
              )}
            </div>
          </>
        )}

        {isPurchaser && status === "submitted" && (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => run("review", () => startReview(request.id))} className={primary}>
              Start review
            </button>
          </div>
        )}

        {pricing && (
          <p className="text-[13px] text-text-secondary">Add the price each supplier offers for every item (more than one supplier to compare), choose one for each item, then send the request for approval.</p>
        )}

        {isPurchaser && status === "under_review" && (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => run("approval", () => sendForApproval(request.id), "Sent for approval.")} className={primary}>
              Send for approval
            </button>
          </div>
        )}

        {status === "pending_approval" && canApprove && (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => run("approve", () => approveRequest(request.id))} className={primary}>
              Approve
            </button>
          </div>
        )}

        {status === "approved" && isPurchaser && (
          <button type="button" disabled={!!busy} onClick={() => run("purchased", () => markPurchased(request.id))} className={primary}>
            Mark as purchased
          </button>
        )}
        {status === "purchased" && (isPurchaser || isKitchen) && (
          <button type="button" disabled={!!busy} onClick={() => run("completed", () => markCompleted(request.id))} className={primary}>
            Mark as completed (goods received)
          </button>
        )}

        {(((isPurchaser || canApprove) && ["under_review", "pending_approval"].includes(status)) || (isPurchaser && status === "submitted") || (canApprove && status === "pending_approval")) && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (to return to Kitchen or to reject)" className={input} />
            <div className="flex flex-wrap gap-2">
              {["under_review", "pending_approval"].includes(status) && (
                <button type="button" disabled={!!busy} onClick={() => run("return", () => returnToKitchen(request.id, reason))} className={outline}>
                  Return to Kitchen
                </button>
              )}
              <button type="button" disabled={!!busy} onClick={() => run("reject", () => rejectRequest(request.id, reason))} className={danger}>
                Reject
              </button>
            </div>
          </div>
        )}
        {!kitchenEdit && !isPurchaser && !canApprove && <p className="text-[13px] text-text-secondary">This request is {STATUS_LABEL[status]}.</p>}
      </div>

      <details className="rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer select-none px-4 py-3 text-[14px] font-bold text-text-secondary">History of this request ({trail.length})</summary>
        <ul className="divide-y divide-border border-t border-border">
          {trail.length === 0 && <li className="px-4 py-3 text-[13px] text-text-muted">No history yet.</li>}
          {trail.map((t) => (
            <li key={t.id} className="px-4 py-2.5 text-[13px] text-text">
              <b>{t.by}</b> · {formatMalaysiaDateTime(t.at)}
              <div className="text-text-secondary">
                {t.action.replace(/_/g, " ")}
                {t.previous && t.next ? `: ${t.previous} → ${t.next}` : t.next ? `: ${t.next}` : ""}
                {t.reason ? ` · ${t.reason}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
