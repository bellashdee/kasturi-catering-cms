"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import { canAccessModule } from "@/lib/modules";
import { itemKey, UNITS, untyped } from "./shared";

/** The Purchaser records a new price a supplier offers for an item. Older prices are kept as history and never replaced. */
export async function recordSupplierPrice(input: { supplierId: string; itemName: string; unit: string; pricePerUnit: number; note?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    if (!canAccessModule(session.allowedModules, "supplier-procurement")) throw new Error("Only the Purchaser can enter supplier prices.");
    const name = input.itemName.replace(/\s+/g, " ").trim();
    if (!name) throw new Error("Write the item name.");
    if (!input.supplierId) throw new Error("Choose the supplier.");
    if (!(UNITS as readonly string[]).includes(input.unit)) throw new Error("Choose the unit.");
    if (!(input.pricePerUnit >= 0) || !Number.isFinite(input.pricePerUnit) || input.pricePerUnit > 1_000_000) throw new Error("Enter the price per unit.");
    const db = untyped(await createClient());
    const { data: supplier } = await db.from("suppliers").select("id, name, company_id").eq("id", input.supplierId).maybeSingle();
    if (!supplier) throw new Error("This supplier was not found, or you do not have access to it.");
    const { data: row, error } = await db
      .from("supplier_price_quotes")
      .insert({ company_id: supplier.company_id, supplier_id: supplier.id, item_key: itemKey(name), item_name: name, unit: input.unit, price_per_unit: input.pricePerUnit, note: input.note?.trim() || null, entered_by: session.userId })
      .select("id")
      .single();
    if (error) throw error;
    await recordAudit({ companyId: supplier.company_id, relatedTable: "supplier_price_quotes", relatedId: row.id, action: "price_entered", newValue: `${name} · ${supplier.name} · RM ${input.pricePerUnit.toFixed(2)} / ${input.unit}` });
    revalidatePath("/supplier-procurement/price-quotes");
    return {};
  });
}
