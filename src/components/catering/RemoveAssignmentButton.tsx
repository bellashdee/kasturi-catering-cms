"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeStaffAssignment, removeEquipmentAssignment } from "@/lib/catering/actions";

export function RemoveAssignmentButton({ kind, assignmentId, eventId }: { kind: "staff" | "equipment"; assignmentId: string; eventId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      if (kind === "staff") await removeStaffAssignment(assignmentId, eventId);
      else await removeEquipmentAssignment(assignmentId, eventId);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={pending} className="text-xs font-semibold text-danger disabled:opacity-50">
      Remove
    </button>
  );
}
