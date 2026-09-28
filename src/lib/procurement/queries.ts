import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export async function listSuppliers(supabase: DB, companyIds: string[], search?: string) {
  let query = supabase.from("suppliers").select("*, companies(name)").in("company_id", companyIds).order("name");
  if (search) query = query.ilike("name", `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getSupplier(supabase: DB, id: string) {
  const { data, error } = await supabase.from("suppliers").select("*, companies(name)").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function listProcurementRequests(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("procurement_requests")
    .select("*, companies(name), profiles(full_name)")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getProcurementRequest(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("procurement_requests")
    .select("*, companies(name), profiles(full_name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listPurchaseOrders(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*, suppliers(name), companies(name), purchase_order_items(id)")
    .in("company_id", companyIds)
    .order("order_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPurchaseOrder(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*, suppliers(id, name), companies(name), purchase_order_items(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listSupplierInvoices(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select("*, suppliers(name), companies(name), purchase_orders(po_number), supplier_payments(amount, status)")
    .in("company_id", companyIds)
    .order("invoice_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getSupplierInvoice(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select("*, suppliers(id, name), companies(name), purchase_orders(id, po_number), supplier_invoice_items(*), supplier_payments(*), documents(id, storage_path, original_filename)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Duplicate Check: looks for an existing invoice from the same supplier with
 * either a matching invoice number, or a matching amount within a few days of
 * the same date — the two most common ways the same bill gets uploaded twice.
 */
export async function findPossibleDuplicateInvoices(
  supabase: DB,
  companyId: string,
  supplierId: string,
  invoiceNumber: string,
  amount: number,
  invoiceDate: string,
) {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select("id, invoice_number, invoice_date, amount, status")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId);
  if (error) throw error;

  const target = new Date(invoiceDate).getTime();
  return (data ?? []).filter((inv) => {
    if (invoiceNumber && inv.invoice_number.trim().toLowerCase() === invoiceNumber.trim().toLowerCase()) return true;
    const sameAmount = Math.abs(Number(inv.amount) - amount) < 0.01;
    const daysApart = Math.abs(new Date(inv.invoice_date).getTime() - target) / (1000 * 60 * 60 * 24);
    return sameAmount && daysApart <= 3;
  });
}

export async function listSupplierPayments(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("supplier_payments")
    .select("*, supplier_invoices(invoice_number, supplier_id, suppliers(name)), companies(name)")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getSupplierPayment(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("supplier_payments")
    .select("*, supplier_invoices(id, invoice_number, amount, supplier_id, suppliers(name)), companies(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
