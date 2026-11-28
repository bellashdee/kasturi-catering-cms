import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { untyped } from "@/lib/kitchenPurchase/shared";
import type { VendorContact, VendorContactItem } from "@/lib/procurement/vendorContacts";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { VendorContactBoard } from "@/components/procurement/VendorContactBoard";

/** Vendor Contact List of the catering business, by category, shared by Signature Solution Sdn Bhd and Kasturi Indah Sdn Bhd. */
export default async function VendorContactsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const { company: requestedId } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  const canUse = (allCompanies ?? []).some((c) => accessibleIds.includes(c.id) && /signature solution|kasturi indah/i.test(c.name));

  const header = (
    <>
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Vendor Contact List · shared by Signature Solution Sdn Bhd and Kasturi Indah Sdn Bhd</p>
      </div>
      <SupplierProcurementSubNav />
    </>
  );
  if (!canUse) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text="The Vendor Contact List is for Signature Solution Sdn Bhd and Kasturi Indah Sdn Bhd. You do not have access to either company." />
      </div>
    );
  }

  const { data, error } = await untyped(supabase)
    .from("vendor_contacts")
    .select("id, category, name, contact_person, address, phone, cell_phone, email, notes, bank_name, bank_account_no, bank_account_holder, payment_qr_document_id")
    .order("category")
    .order("name")
    .limit(5000);

  if (error) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text={`The vendor list could not be loaded: ${error.message}`} />
      </div>
    );
  }
  // the items and prices of every vendor, in the order they were typed
  const { data: itemRows } = await untyped(supabase)
    .from("vendor_contact_items")
    .select("id, vendor_contact_id, item, unit, price, notes, sort_order")
    .order("sort_order")
    .limit(20000);
  const itemsOf = new Map<string, VendorContactItem[]>();
  for (const i of (itemRows ?? []) as VendorContactItem[]) {
    const list = itemsOf.get(i.vendor_contact_id) ?? [];
    list.push({ ...i, price: i.price === null ? null : Number(i.price) });
    itemsOf.set(i.vendor_contact_id, list);
  }
  const contacts = ((data ?? []) as Omit<VendorContact, "items">[]).map((c) => ({ ...c, items: itemsOf.get(c.id) ?? [] }));
  // a QR photo is filed under one of the two companies (the list itself is shared by both)
  const uploadCompanyId = (allCompanies ?? []).find((c) => accessibleIds.includes(c.id) && /signature solution|kasturi indah/i.test(c.name))?.id ?? null;
  return <VendorContactBoard contacts={contacts} subNav={<SupplierProcurementSubNav />} uploadCompanyId={uploadCompanyId} />;
}
