"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DecisionButtons({
  onApprove,
  onReject,
}: {
  /** May return { ok: false, error } to report a refused decision; plain void still works for older callers. */
  onApprove: () => Promise<void | { ok: boolean; error?: string }>;
  onReject: () => Promise<void | { ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void | { ok: boolean; error?: string }>) {
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (result && result.ok === false) setError(result.error ?? "The decision could not be saved.");
      else router.refresh();
    } catch {
      setError("The decision could not be saved. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
    <div className="flex gap-2">
      <button
        disabled={pending}
        onClick={() => run(onReject)}
        className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger disabled:opacity-50"
      >
        Reject
      </button>
      <button
        disabled={pending}
        onClick={() => run(onApprove)}
        className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
      >
        Approve
      </button>
    </div>
    {error && <p role="alert" className="max-w-xs text-right text-[11.5px] font-semibold text-danger">{error}</p>}
    </div>
  );
}
