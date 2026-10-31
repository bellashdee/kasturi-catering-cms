import { redirect } from "next/navigation";

/** The Invoice Listing report is now the "Invoices issued" view of the Revenue Report. */
export default function InvoiceListingRedirect() {
  redirect("/reports/revenue?view=invoiced");
}
