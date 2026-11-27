"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeEventStatus } from "@/lib/catering/actions";
import { Select } from "@/components/ui/Select";

const OPTIONS = ["enquiry", "quoted", "date_confirmed", "details_pending", "ready_for_planning", "confirmed", "in_production", "delivered", "completed", "cancelled"];
const LABEL: Record<string, string> = {
  enquiry: "Enquiry",
  quoted: "Quoted",
  date_confirmed: "Date Confirmed (menu & pax pending)",
  details_pending: "Details Pending",
  ready_for_planning: "Ready for Planning",
  confirmed: "Confirmed",
  in_production: "In Production",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function EventStatusSelect({ eventId, status }: { eventId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    setPending(true);
    setError(null);
    const r = await changeEventStatus(eventId, next);
    setPending(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Select
        value={status}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text disabled:opacity-60"
      >
        {OPTIONS.map((o) => (
          <option key={o} value={o}>{LABEL[o]}</option>
        ))}
      </Select>
      {error && <span className="max-w-xs text-[12px] font-semibold text-danger">{error}</span>}
    </span>
  );
}
