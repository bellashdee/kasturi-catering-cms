"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCompanyDocument } from "@/lib/hr/actions";

export function DeleteCompanyDocumentButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    try {
      await deleteCompanyDocument(id);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-xs font-semibold text-danger">
        Delete
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <button disabled={pending} onClick={remove} className="font-bold text-danger disabled:opacity-60">
        {pending ? "Deleting..." : "Confirm delete"}
      </button>
      <button onClick={() => setConfirming(false)} className="font-semibold text-text-secondary">
        Cancel
      </button>
    </span>
  );
}
