"use client";

import { useRouter } from "next/navigation";
import { deleteWastage, restoreWastage } from "@/lib/kitchen/wastageActions";
import type { WastageRow } from "@/lib/kitchen/wastage";
import { RecordActions } from "@/components/shared/RecordActions";
import type { ActionResult } from "@/lib/actionResult";
import { isNetworkError, queueChange, shouldQueue } from "@/lib/offline/sync";

/** Edit and Delete (with Undo) of one Wastage Log entry. Only shown for the person who recorded it and the admins of the company. */
export function WastageRowActions({ id, item, editHref, companyId, updatedAt }: { id: string; item: string; editHref: string; companyId?: string; updatedAt?: string }) {
  const router = useRouter();

  // no connection: the delete is kept on this device and done when the connection is back (only if nobody changed the entry meanwhile)
  async function keepOffline(): Promise<ActionResult<{ row: WastageRow }>> {
    await queueChange({
      op: "wastage.delete",
      recordId: id,
      companyId: companyId ?? null,
      payload: {},
      base: { updatedAt: updatedAt ?? null },
      label: { title: "Wastage Log: delete", detail: item },
    });
    return { ok: false, error: "No connection: the delete is kept on this device and done when the connection is back." };
  }

  async function remove(): Promise<ActionResult<{ row: WastageRow }>> {
    if (shouldQueue()) return keepOffline();
    try {
      return await deleteWastage(id);
    } catch (err) {
      if (isNetworkError(err)) return keepOffline();
      throw err;
    }
  }

  return (
    <RecordActions<WastageRow>
      onEdit={() => router.push(editHref)}
      onDelete={remove}
      onRestore={(row) => restoreWastage(row)}
      confirmText={`Delete the wastage entry for "${item}"?`}
    />
  );
}
