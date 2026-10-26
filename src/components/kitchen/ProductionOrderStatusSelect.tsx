"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProductionOrderStatus } from "@/lib/kitchen/actions";
import { PRODUCTION_STATUS_LABEL } from "@/lib/kitchen/constants";
import { Select } from "@/components/ui/Select";

const OPTIONS = ["planned", "preparing", "ready", "completed"];

export function ProductionOrderStatusSelect({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    setPending(true);
    setError(null);
    try {
      await updateProductionOrderStatus(orderId, next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        value={status}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text disabled:opacity-60"
      >
        {OPTIONS.map((o) => (
          <option key={o} value={o}>{PRODUCTION_STATUS_LABEL[o] ?? o}</option>
        ))}
      </Select>
      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  );
}
