"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateDeliveryStatus } from "@/lib/driver/actions";
import { DELIVERY_STATUS_LABEL } from "@/lib/driver/constants";
import { Select } from "@/components/ui/Select";
import { useI18n } from "@/components/i18n/I18nProvider";
import { isNetworkError, queueChange, shouldQueue } from "@/lib/offline/sync";

const OPTIONS = ["scheduled", "in_transit", "delivered", "cancelled"];

export function DeliveryStatusSelect({ deliveryId, status, companyId, label }: { deliveryId: string; status: string; companyId?: string; label?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  // a status chosen offline: shown at once, sent when the connection is back (only over the status the driver saw)
  const [queued, setQueued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function keepOffline(next: string) {
    if (next === "delivered") {
      setError(t("Delivered needs the proof of delivery: use Complete Task when the connection is back."));
      return;
    }
    await queueChange({
      op: "delivery.setStatus",
      recordId: deliveryId,
      companyId: companyId ?? null,
      payload: { status: next },
      base: { status },
      label: { title: "Delivery: status change", detail: `${label ? `${label} · ` : ""}${DELIVERY_STATUS_LABEL[status] ?? status} → ${DELIVERY_STATUS_LABEL[next] ?? next}` },
    });
    setQueued(next);
  }

  async function handleChange(next: string) {
    setPending(true);
    setError(null);
    try {
      if (shouldQueue()) return await keepOffline(next);
      await updateDeliveryStatus(deliveryId, next);
      router.refresh();
    } catch (err) {
      if (isNetworkError(err)) await keepOffline(next);
      else setError(err instanceof Error ? err.message : t("Could not change the status."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        value={queued ?? status}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text disabled:opacity-60"
      >
        {OPTIONS.map((o) => (
          <option key={o} value={o}>{DELIVERY_STATUS_LABEL[o] ?? o}</option>
        ))}
      </Select>
      {queued && <span className="text-[12px] font-semibold text-warning">{t("Kept on this device: sent when the connection is back.")}</span>}
      {error && <span className="text-[12px] font-semibold text-danger">{error}</span>}
    </div>
  );
}
