"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateDeliveryStatus } from "@/lib/driver/actions";
import { DELIVERY_STATUS_LABEL } from "@/lib/driver/constants";

const OPTIONS = ["scheduled", "in_transit", "delivered", "cancelled"];

export function DeliveryStatusSelect({ deliveryId, status }: { deliveryId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleChange(next: string) {
    setPending(true);
    try {
      await updateDeliveryStatus(deliveryId, next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => handleChange(e.target.value)}
      className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text disabled:opacity-60"
    >
      {OPTIONS.map((o) => (
        <option key={o} value={o}>{DELIVERY_STATUS_LABEL[o] ?? o}</option>
      ))}
    </select>
  );
}
