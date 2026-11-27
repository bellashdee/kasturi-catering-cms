"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  addSnackItem,
  decideAdditionalAllocation,
  deleteSnackPurchase,
  markFundReceived,
  recordSnackPurchase,
  requestAdditionalAllocation,
  snackReceiptUpload,
  snackReceiptUrl,
  updateSnackItem,
  updateSnackRequest,
} from "@/lib/snack/actions";
import { ITEM_STATUS_LABEL, PAYMENT_METHODS, SNACK_STATUS_LABEL } from "@/lib/snack/constants";
import { SNACK_UNITS } from "@/lib/whatsapp/types";
import { reserveTab } from "@/lib/openTab";
import { Select } from "@/components/ui/Select";
import { TimeInput12 } from "@/components/ui/TimeInput12";

const input = "mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px] outline-none focus:border-primary";
const label = "text-[12px] font-semibold text-text-secondary";
const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-60";
const primary = "h-9 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-white disabled:opacity-60";
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Something went wrong.");
    after?.();
    router.refresh();
  }
  return { busy, error, run };
}

export function SnackStatusSelect({ id, status }: { id: string; status: string }) {
  const { busy, error, run } = useRun();
  return (
    <span className="inline-flex flex-col gap-1">
      <Select value={status} disabled={busy} onChange={(e) => void run(() => updateSnackRequest(id, { status: e.target.value }))} className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold">
        {Object.entries(SNACK_STATUS_LABEL).map(([k, l]) => (
          <option key={k} value={k}>{l}</option>
        ))}
      </Select>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}

/** The training date, delivery time / place and remarks of a request (the date can be confirmed when the year was not in the message). */
export function SnackRequestDetails({ id, trainingDate, needsCheck, deliveryTime, deliveryLocation, remarks }: { id: string; trainingDate: string | null; needsCheck: boolean; deliveryTime: string | null; deliveryLocation: string | null; remarks: string | null }) {
  const { busy, error, run } = useRun();
  const [f, setF] = useState({ trainingDate: trainingDate ?? "", deliveryTime: deliveryTime?.slice(0, 5) ?? "", deliveryLocation: deliveryLocation ?? "", remarks: remarks ?? "" });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => updateSnackRequest(id, { ...f, dateChecked: true }));
      }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <div>
        <label className={label}>Training date</label>
        <input type="date" value={f.trainingDate} onChange={(e) => setF({ ...f, trainingDate: e.target.value })} className={input} />
        {needsCheck && <div className="mt-1 rounded bg-yellow-50 px-2 py-1 text-[12px] font-semibold text-yellow-900">! The year was not in the message. Check the date, then press Save.</div>}
      </div>
      <div>
        <label className={label}>Delivery time</label>
        <TimeInput12 value={f.deliveryTime} onChange={(v) => setF({ ...f, deliveryTime: v })} fieldClass={input} className="!mt-1" ariaLabel="Delivery time" />
      </div>
      <div>
        <label className={label}>Delivery location</label>
        <input value={f.deliveryLocation} onChange={(e) => setF({ ...f, deliveryLocation: e.target.value })} className={input} placeholder="Not Provided" />
      </div>
      <div className="sm:col-span-3">
        <label className={label}>Remarks</label>
        <textarea value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} className={`${input} h-16 py-2`} />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className={primary}>
          {busy ? "Saving..." : "Save"}
        </button>
        {error && <span className="text-[12px] text-danger">{error}</span>}
      </div>
    </form>
  );
}

export type ItemView = { id: string; name: string; requested_qty: number | null; unit: string | null; remarks: string | null; item_status: string; substitute: string | null; purchasedQty: number; spent: number | null };

/** One requested item: Purchasing changes its quantity / unit, marks it purchased, unavailable or substituted. */
export function SnackItemRowEditor({ requestId, item, canEdit, showMoney }: { requestId: string; item: ItemView; canEdit: boolean; showMoney: boolean }) {
  const { busy, error, run } = useRun();
  const [qty, setQty] = useState(item.requested_qty !== null ? String(item.requested_qty) : "");
  const [unit, setUnit] = useState(item.unit ?? "");
  const [sub, setSub] = useState(item.substitute ?? "");
  const tone = item.item_status === "purchased" ? "text-success" : item.item_status === "unavailable" ? "text-danger" : item.item_status === "substituted" ? "text-yellow-800" : "text-text-secondary";
  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <div className="font-semibold text-text">{item.name}</div>
        {item.remarks && <div className="text-[12px] text-text-muted">{item.remarks}</div>}
        {item.item_status === "substituted" && item.substitute && <div className="text-[12px] font-semibold text-yellow-800">{`Substituted with: ${item.substitute}`}</div>}
      </td>
      <td className="px-3 py-2">
        {canEdit ? (
          <div className="flex gap-1">
            <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={`${input} !mt-0 w-20 ${qty ? "" : "border-danger"}`} placeholder="Pending" aria-label="Quantity" />
            <input list="snack-units" value={unit} onChange={(e) => setUnit(e.target.value)} className={`${input} !mt-0 w-24`} placeholder="Unit" aria-label="Unit" />
            {(qty !== (item.requested_qty !== null ? String(item.requested_qty) : "") || unit !== (item.unit ?? "")) && (
              <button type="button" disabled={busy} onClick={() => void run(() => updateSnackItem(item.id, requestId, { quantity: qty ? Number(qty) : null, unit }))} className={btn}>
                Save
              </button>
            )}
          </div>
        ) : (
          <span className={item.requested_qty ? "font-semibold" : "font-bold text-danger"}>{item.requested_qty ? `${item.requested_qty} ${item.unit ?? ""}` : "Pending"}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{item.purchasedQty > 0 ? `${item.purchasedQty} ${item.unit ?? ""}` : "—"}</td>
      {showMoney && <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{item.spent !== null && item.spent > 0 ? `RM${item.spent.toFixed(2)}` : "—"}</td>}
      <td className="px-3 py-2">
        {canEdit ? (
          <div className="flex flex-col gap-1">
            <Select value={item.item_status} disabled={busy} onChange={(e) => void run(() => updateSnackItem(item.id, requestId, { itemStatus: e.target.value }))} className={`${input} !mt-0 font-semibold ${tone}`}>
              {Object.entries(ITEM_STATUS_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </Select>
            {item.item_status === "substituted" && (
              <div className="flex gap-1">
                <input value={sub} onChange={(e) => setSub(e.target.value)} className={`${input} !mt-0`} placeholder="Substituted with..." />
                {sub !== (item.substitute ?? "") && (
                  <button type="button" disabled={busy} onClick={() => void run(() => updateSnackItem(item.id, requestId, { substitute: sub }))} className={btn}>
                    Save
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <span className={`font-semibold ${tone}`}>{ITEM_STATUS_LABEL[item.item_status] ?? item.item_status}</span>
        )}
        {error && <div className="text-[12px] text-danger">{error}</div>}
      </td>
    </tr>
  );
}

export function UnitsList() {
  return (
    <datalist id="snack-units">
      {SNACK_UNITS.map((u) => (
        <option key={u} value={u} />
      ))}
    </datalist>
  );
}

export function AddSnackItem({ requestId }: { requestId: string }) {
  const { busy, error, run } = useRun();
  const [f, setF] = useState({ name: "", qty: "", unit: "", remarks: "" });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => addSnackItem(requestId, { name: f.name, quantity: f.qty ? Number(f.qty) : null, unit: f.unit, remarks: f.remarks }), () => setF({ name: "", qty: "", unit: "", remarks: "" }));
      }}
      className="flex flex-wrap items-end gap-1.5"
    >
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${input} !mt-0 w-44`} placeholder="New item" required />
      <input type="number" min={0} step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} className={`${input} !mt-0 w-20`} placeholder="Qty" />
      <input list="snack-units" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className={`${input} !mt-0 w-24`} placeholder="Unit" />
      <input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} className={`${input} !mt-0 w-44`} placeholder="Remarks" />
      <button type="submit" disabled={busy} className={btn}>
        + Add item
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </form>
  );
}

/** Records a purchase (an expense of the JDT II Snack Fund), with its receipt. */
export function RecordPurchaseForm({ requestId, trainingDate, items }: { requestId: string | null; trainingDate: string | null; items: { id: string; name: string; unit: string | null }[] }) {
  const { busy, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const blank = () => ({ itemId: "", purchaseDate: today(), description: "", quantity: "", unit: "", supplier: "", unitPrice: "", totalPrice: "", paymentMethod: "Cash", remarks: "", markItemPurchased: true });
  const [f, setF] = useState(blank);
  const total = f.totalPrice ? Number(f.totalPrice) : f.quantity && f.unitPrice ? Math.round(Number(f.quantity) * Number(f.unitPrice) * 100) / 100 : null;

  async function save() {
    setUploadError(null);
    let receiptPath: string | undefined;
    if (file) {
      const pass = await snackReceiptUpload(file.name);
      if (!pass.ok) return setUploadError(pass.error);
      const { error: upErr } = await createClient().storage.from("snack-receipts").uploadToSignedUrl(pass.path, pass.token, file, { contentType: file.type || undefined });
      if (upErr) return setUploadError("The receipt could not be uploaded. Try again.");
      receiptPath = pass.path;
    }
    await run(
      () =>
        recordSnackPurchase({
          requestId,
          itemId: f.itemId || null,
          purchaseDate: f.purchaseDate,
          trainingDate: trainingDate ?? undefined,
          description: f.description,
          quantity: f.quantity ? Number(f.quantity) : null,
          unit: f.unit,
          supplier: f.supplier,
          unitPrice: f.unitPrice ? Number(f.unitPrice) : null,
          totalPrice: f.totalPrice ? Number(f.totalPrice) : null,
          paymentMethod: f.paymentMethod,
          receiptPath,
          receiptName: file?.name,
          remarks: f.remarks,
          markItemPurchased: f.markItemPurchased,
        }),
      () => {
        setF(blank());
        setFile(null);
        setOpen(false);
      },
    );
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={primary}>
        + Record a purchase
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="rounded-xl border border-border bg-surface-alt p-3"
    >
      <div className="text-[14px] font-extrabold text-text">Record a purchase</div>
      <p className="text-[12px] text-text-secondary">Taken off the JDT II Snack Fund. Never added to an event&apos;s P&amp;L.</p>
      <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {items.length > 0 && (
          <div>
            <label className={label}>Item of this request</label>
            <Select
              value={f.itemId}
              onChange={(e) => {
                const it = items.find((i) => i.id === e.target.value);
                setF({ ...f, itemId: e.target.value, description: it ? it.name : f.description, unit: it?.unit ?? f.unit });
              }}
              className={input}
            >
              <option value="">— not one item —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </Select>
          </div>
        )}
        <div className={items.length > 0 ? "sm:col-span-2" : "sm:col-span-3"}>
          <label className={label}>What was bought *</label>
          <input required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label}>Purchase date *</label>
          <input required type="date" value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label}>Quantity</label>
          <div className="flex gap-1">
            <input type="number" min={0} step="any" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} className={input} />
            <input list="snack-units" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className={`${input} w-24`} placeholder="Unit" />
          </div>
        </div>
        <div>
          <label className={label}>Supplier</label>
          <input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label}>Unit price (RM)</label>
          <input type="number" min={0} step="0.01" value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label}>Total price (RM) *</label>
          <input type="number" min={0} step="0.01" value={f.totalPrice} onChange={(e) => setF({ ...f, totalPrice: e.target.value })} className={input} placeholder={total !== null ? total.toFixed(2) : "qty × unit price"} />
        </div>
        <div>
          <label className={label}>Payment method</label>
          <Select value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })} className={input}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Receipt (photo or PDF)</label>
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[13px]" />
        </div>
        <div>
          <label className={label}>Remarks</label>
          <input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} className={input} />
        </div>
      </div>
      {f.itemId && (
        <label className="mt-2 flex items-center gap-2 text-[12.5px] text-text-secondary">
          <input type="checkbox" checked={f.markItemPurchased} onChange={(e) => setF({ ...f, markItemPurchased: e.target.checked })} /> Mark this item Purchased
        </label>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className={primary}>
          {busy ? "Saving..." : `Save purchase${total !== null ? ` (RM${total.toFixed(2)})` : ""}`}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btn}>
          Cancel
        </button>
        {(error || uploadError) && <span className="text-[12.5px] font-semibold text-danger">{error ?? uploadError}</span>}
      </div>
    </form>
  );
}

export function ReceiptButton({ purchaseId }: { purchaseId: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={async () => {
          const tab = reserveTab();
          const r = await snackReceiptUrl(purchaseId);
          if (r.ok) tab.go(r.url);
          else {
            tab.cancel();
            setError(r.error);
          }
        }}
        className="text-[12.5px] font-semibold text-primary hover:underline"
      >
        Receipt
      </button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </span>
  );
}

export function DeletePurchaseButton({ id }: { id: string }) {
  const { busy, error, run } = useRun();
  return (
    <span>
      <button type="button" disabled={busy} onClick={() => window.confirm("Remove this purchase (keyed in by mistake)? It is written to the audit trail.") && void run(() => deleteSnackPurchase(id))} className="text-[12px] font-semibold text-text-muted hover:text-danger">
        Remove
      </button>
      {error && <span className="ml-1 text-[11.5px] text-danger">{error}</span>}
    </span>
  );
}

// ---------- the fund ----------

export function MarkFundReceived({ allocationId, amount }: { allocationId: string; amount: number }) {
  const { busy, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [ref, setRef] = useState("");
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={btn}>
        Record payment received
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => markFundReceived(allocationId, date, ref), () => setOpen(false));
      }}
      className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-alt p-2"
    >
      <div>
        <label className={label}>Date received</label>
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
      </div>
      <div>
        <label className={label}>Payment reference (checked)</label>
        <input required value={ref} onChange={(e) => setRef(e.target.value)} className={input} placeholder="e.g. bank transfer ref." />
      </div>
      <button type="submit" disabled={busy} className={primary}>
        {`Confirm RM${amount.toFixed(2)} received`}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={btn}>
        Cancel
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </form>
  );
}

export function RequestAdditional() {
  const { busy, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [why, setWhy] = useState("");
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={btn}>
        Ask for an additional allocation
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => requestAdditionalAllocation(Number(amount), why), () => setOpen(false));
      }}
      className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-alt p-2"
    >
      <div>
        <label className={label}>Amount (RM)</label>
        <input type="number" min={1} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} w-28`} />
      </div>
      <div className="min-w-[14rem] flex-1">
        <label className={label}>Why it is needed</label>
        <input required value={why} onChange={(e) => setWhy(e.target.value)} className={input} />
      </div>
      <button type="submit" disabled={busy} className={primary}>
        Send to Management for approval
      </button>
      <button type="button" onClick={() => setOpen(false)} className={btn}>
        Cancel
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </form>
  );
}

export function DecideAllocation({ id }: { id: string }) {
  const { busy, error, run } = useRun();
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" disabled={busy} onClick={() => void run(() => decideAdditionalAllocation(id, true))} className="h-8 rounded-lg bg-success px-2.5 text-[12.5px] font-semibold text-white">
        Approve
      </button>
      <button type="button" disabled={busy} onClick={() => void run(() => decideAdditionalAllocation(id, false))} className="h-8 rounded-lg border border-danger/40 bg-surface px-2.5 text-[12.5px] font-semibold text-danger">
        Reject
      </button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </span>
  );
}
