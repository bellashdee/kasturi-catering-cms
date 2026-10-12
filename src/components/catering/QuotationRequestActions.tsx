"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveQuotationRequest, rejectQuotationRequest } from "@/lib/catering/quotationRequestActions";

export function QuotationRequestActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: string; eventId?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => run(() => approveQuotationRequest(requestId))} className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60">
          Approve &amp; create quotation
        </button>
        <button disabled={busy} onClick={() => run(() => rejectQuotationRequest(requestId))} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-danger disabled:opacity-60">
          Reject
        </button>
      </div>
      {error && <div className="max-w-xs text-right text-xs text-danger">{error}</div>}
    </div>
  );
}
