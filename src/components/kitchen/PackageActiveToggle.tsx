"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPackageMenuActive } from "@/lib/kitchen/packages/actions";

export function PackageActiveToggle({ packageId, isActive }: { packageId: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      await setPackageMenuActive(packageId, !isActive);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
        isActive ? "border-danger/40 text-danger" : "border-success/40 text-success"
      }`}
    >
      {isActive ? "Deactivate" : "Activate"}
    </button>
  );
}
