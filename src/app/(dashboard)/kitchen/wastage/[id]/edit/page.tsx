import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { pastWastageItems } from "@/lib/kitchen/wastageQueries";
import { todayInMalaysia } from "@/lib/format";
import { WastageForm } from "@/components/kitchen/WastageForm";

export default async function EditWastagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId } = await searchParams;
  const supabase = await createClient();
  const { data: row } = await supabase.from("wastage_log").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const items = await pastWastageItems(supabase, [row.company_id]);
  const query = requestedId ? `?company=${requestedId}` : "";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/kitchen/wastage${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to the Wastage Log</Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Edit Wastage Entry</h1>
      <p className="mt-1 text-[13px] text-text-secondary">Only the person who recorded an entry, or an admin of the company, can change it.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface shadow-sm">
        <WastageForm companyId={row.company_id} today={todayInMalaysia()} items={items} editing={row} listHref={`/kitchen/wastage${query}`} />
      </div>
    </div>
  );
}
