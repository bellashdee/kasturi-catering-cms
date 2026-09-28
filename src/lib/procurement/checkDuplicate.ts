"use server";

import { createClient } from "@/lib/supabase/server";
import { findPossibleDuplicateInvoices } from "@/lib/procurement/queries";

export async function checkDuplicateInvoiceAction(input: {
  companyId: string;
  supplierId: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
}) {
  const supabase = await createClient();
  return findPossibleDuplicateInvoices(supabase, input.companyId, input.supplierId, input.invoiceNumber, input.amount, input.invoiceDate);
}
