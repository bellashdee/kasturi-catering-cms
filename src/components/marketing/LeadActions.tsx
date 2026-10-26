"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLeadStatus, convertLeadToCustomer } from "@/lib/marketing/actions";
import { Select } from "@/components/ui/Select";

export function LeadActions({ leadId, status }: { leadId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleStatusChange(next: string) {
    setPending(true);
    try {
      await updateLeadStatus(leadId, next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleConvert() {
    setPending(true);
    try {
      await convertLeadToCustomer(leadId);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (status === "converted") {
    return <span className="text-xs font-semibold text-text-muted">Converted to customer</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={status}
        disabled={pending}
        onChange={(e) => handleStatusChange(e.target.value)}
        className="h-8 rounded-lg border border-border-strong px-2 text-xs"
      >
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
        <option value="qualified">Qualified</option>
        <option value="lost">Lost</option>
      </Select>
      <button
        onClick={handleConvert}
        disabled={pending}
        className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
      >
        Convert to Customer
      </button>
    </div>
  );
}
