"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DecisionButtons({
  onApprove,
  onReject,
}: {
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    setPending(true);
    try {
      await action();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
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
  );
}
