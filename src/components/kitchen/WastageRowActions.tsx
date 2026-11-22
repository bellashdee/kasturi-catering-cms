"use client";

import { useRouter } from "next/navigation";
import { deleteWastage, restoreWastage } from "@/lib/kitchen/wastageActions";
import type { WastageRow } from "@/lib/kitchen/wastage";
import { RecordActions } from "@/components/shared/RecordActions";

/** Edit and Delete (with Undo) of one Wastage Log entry. Only shown for the person who recorded it and the admins of the company. */
export function WastageRowActions({ id, item, editHref }: { id: string; item: string; editHref: string }) {
  const router = useRouter();
  return (
    <RecordActions<WastageRow>
      onEdit={() => router.push(editHref)}
      onDelete={() => deleteWastage(id)}
      onRestore={(row) => restoreWastage(row)}
      confirmText={`Delete the wastage entry for "${item}"?`}
    />
  );
}
