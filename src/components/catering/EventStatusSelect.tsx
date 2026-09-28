"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateEventStatus } from "@/lib/catering/actions";

const OPTIONS = ["enquiry", "quoted", "confirmed", "in_production", "delivered", "completed", "cancelled"];
const LABEL: Record<string, string> = {
  enquiry: "Enquiry",
  quoted: "Quoted",
  confirmed: "Confirmed",
  in_production: "In Production",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function EventStatusSelect({ eventId, status }: { eventId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleChange(next: string) {
    setPending(true);
    try {
      await updateEventStatus(eventId, next);
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
        <option key={o} value={o}>{LABEL[o]}</option>
      ))}
    </select>
  );
}
