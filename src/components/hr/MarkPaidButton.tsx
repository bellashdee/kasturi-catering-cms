"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markPayrollPaid } from "@/lib/hr/actions";

export function MarkPaidButton({ payrollId }: { payrollId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await markPayrollPaid(payrollId);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
    >
      {pending ? "Marking..." : "Mark Paid"}
    </button>
  );
}
