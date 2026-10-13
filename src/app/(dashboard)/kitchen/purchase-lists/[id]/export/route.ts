import { createClient } from "@/lib/supabase/server";
import { getPurchaseList } from "@/lib/purchaseList/queries";
import { buildPurchaseListWorkbook } from "@/lib/purchaseList/exportXlsx";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const { id } = await params;
  let list;
  try {
    list = await getPurchaseList(supabase, id);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const buffer = buildPurchaseListWorkbook(list);

  const safe = list.event_name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "purchase-list";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="purchase-list-${safe}.xlsx"`,
    },
  });
}
