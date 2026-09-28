import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getSupplier } from "@/lib/procurement/queries";
import { SupplierForm } from "@/components/procurement/SupplierForm";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let supplier;
  try {
    supplier = await getSupplier(supabase, id);
  } catch {
    notFound();
  }

  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">Edit Supplier</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <SupplierForm
          companies={allCompanies ?? []}
          supplierId={id}
          initial={{
            companyId: supplier.company_id,
            name: supplier.name,
            category: supplier.category ?? undefined,
            contactPerson: supplier.contact_person ?? undefined,
            phone: supplier.phone ?? undefined,
            paymentTerms: supplier.payment_terms ?? undefined,
            status: supplier.status,
          }}
        />
      </div>
    </div>
  );
}
