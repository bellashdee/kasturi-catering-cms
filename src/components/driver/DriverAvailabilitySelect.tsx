"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateDriverAvailability } from "@/lib/driver/actions";
import { AVAILABILITY_LABEL } from "@/lib/driver/constants";
import { Select } from "@/components/ui/Select";

const OPTIONS = ["available", "on_delivery", "off_duty", "on_leave"];

export function DriverAvailabilitySelect({ driverId, status }: { driverId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleChange(next: string) {
    setPending(true);
    try {
      await updateDriverAvailability(driverId, next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Select
      value={status}
      disabled={pending}
      onChange={(e) => handleChange(e.target.value)}
      className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text disabled:opacity-60"
    >
      {OPTIONS.map((o) => (
        <option key={o} value={o}>{AVAILABILITY_LABEL[o] ?? o}</option>
      ))}
    </Select>
  );
}
