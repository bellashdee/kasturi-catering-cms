import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { canAccessModule } from "@/lib/modules";
import { getKitchenRequest, listSuppliersFor, requestTrail } from "@/lib/kitchenPurchase/queries";
import { RequestWorkspace } from "./RequestWorkspace";

/** One purchase request, opened from the Kitchen tab or from the Purchaser's Supplier & Procurement tab. */
export async function RequestPageBody({ id, backHref, backLabel, startEditing = false }: { id: string; backHref: string; backLabel: string; startEditing?: boolean }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const detail = await getKitchenRequest(supabase, id);
  if (!detail) notFound();
  const [trail, suppliers] = await Promise.all([requestTrail(supabase, id), listSuppliersFor(supabase, [detail.request.company_id])]);
  const key = `${detail.request.status}:${detail.request.updated_at ?? ""}:${detail.items.map((i) => `${i.id}${i.quantity}${i.selectedQuoteId ?? ""}`).join("|")}:${detail.quotes.length}`;
  return (
    <div className="flex flex-col gap-4">
      <Link href={backHref} className="text-[13.5px] font-semibold text-text-secondary hover:underline">
        ← {backLabel}
      </Link>
      <RequestWorkspace
        key={key}
        request={detail.request}
        items={detail.items}
        quotes={detail.quotes}
        trail={trail}
        suppliers={suppliers}
        isKitchen={canAccessModule(session.allowedModules, "kitchen")}
        isPurchaser={canAccessModule(session.allowedModules, "supplier-procurement")}
        canApprove={session.role !== "staff"}
        startEditing={startEditing}
      />
    </div>
  );
}
