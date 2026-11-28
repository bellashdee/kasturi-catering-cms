"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { canAccessModule } from "@/lib/modules";
import { untyped } from "@/lib/kitchenPurchase/shared";

export type VendorContactInput = {
  id?: string;
  category: string;
  name: string;
  contactPerson: string;
  address: string;
  phone: string;
  cellPhone: string;
  email: string;
  notes: string;
  bankName: string;
  bankAccountNo: string;
  bankAccountHolder: string;
};

const clean = (v: string, max = 300) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

async function guard() {
  const session = await getSessionContext();
  if (!session) throw new Error("Please sign in again.");
  if (!canAccessModule(session.allowedModules, "supplier-procurement")) throw new Error("You do not have access to Supplier & Procurement.");
  return session;
}

/** Adds a vendor, or saves the changes of one (when it has an id). The list is shared by Signature Solution and Kasturi Indah. */
export async function saveVendorContact(input: VendorContactInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const session = await guard();
    const category = clean(input.category, 60);
    const name = clean(input.name, 150);
    if (!category) throw new Error("Choose the category.");
    if (!name) throw new Error("Enter the vendor name.");
    const email = clean(input.email, 150);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("The email address does not look right.");
    const row = {
      category,
      name,
      contact_person: clean(input.contactPerson, 120),
      address: clean(input.address, 400),
      phone: clean(input.phone, 40),
      cell_phone: clean(input.cellPhone, 40),
      email,
      notes: clean(input.notes, 600),
      bank_name: clean(input.bankName, 80),
      // the account number with spaces and dashes taken out, so it can be pasted straight into online banking
      bank_account_no: clean((input.bankAccountNo ?? "").replace(/[\s-]/g, ""), 40),
      bank_account_holder: clean(input.bankAccountHolder, 150),
    };
    if (row.bank_account_no && !/^\d{5,20}$/.test(row.bank_account_no)) throw new Error("The bank account number should only have digits (5 to 20).");
    if (row.bank_account_no && !row.bank_name) throw new Error("Choose the bank of the account.");
    const supabase = untyped(await createClient());
    let id = input.id;
    if (id) {
      const { error } = await supabase.from("vendor_contacts").update(row).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("vendor_contacts").insert({ ...row, created_by: session.userId }).select("id").single();
      if (error) throw error;
      id = (data as { id: string }).id;
    }
    revalidatePath("/supplier-procurement/vendors");
    return { id: id! };
  });
}

export async function deleteVendorContact(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await guard();
    const supabase = untyped(await createClient());
    const { error } = await supabase.from("vendor_contacts").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/supplier-procurement/vendors");
    return {};
  });
}
