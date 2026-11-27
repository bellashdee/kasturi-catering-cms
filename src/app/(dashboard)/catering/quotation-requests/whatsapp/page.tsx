import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { CateringSubNav } from "@/components/catering/CateringSubNav";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { WhatsappImport, type RecentImport } from "@/components/whatsapp/WhatsappImport";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { displayNames } from "@/lib/hr/superiors";
import { formatMalaysiaDateTime } from "@/lib/format";
import { SIGNATURE_COMPANY_ID } from "@/lib/catering/constants";
import { WA_CATEGORY_LABEL, type WaCategory, type WaResult } from "@/lib/whatsapp/types";

// reading a message with the AI can take up to about a minute (the free AI service is sometimes slow)
export const maxDuration = 60;

type ImportRow = {
  id: string;
  original_message: string;
  category: WaCategory;
  ai_category: WaCategory | null;
  ai_result: WaResult | null;
  edited_result: WaResult | null;
  status: string;
  quotation_request_id: string | null;
  event_ids: string[];
  snack_request_id: string | null;
  imported_by: string | null;
  imported_at: string;
  submitted_by: string | null;
  submitted_at: string | null;
};

function linkOf(r: ImportRow, query: string): string | null {
  if (r.quotation_request_id) return `/catering/quotation-requests/${r.quotation_request_id}${query}`;
  if (r.snack_request_id) return `/supplier-procurement/jdt-snacks/${r.snack_request_id}${query}`;
  if (r.event_ids?.length === 1) return `/catering/${r.event_ids[0]}${query}`;
  if (r.event_ids?.length > 1) return `/catering/calendar${query}`;
  return null;
}

/**
 * WhatsApp Message Import (Signature Solution only): the Admin pastes the Boss's message, the AI sorts it into a quotation request,
 * JDT match dates or a JDT training snack request, the Admin checks / edits and submits. Every message is kept for the record.
 */
export default async function WhatsappImportPage({ searchParams }: { searchParams: Promise<{ company?: string; id?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("user_has_quotation_request_access");
  if (allowed !== true) return <EmptyRow text="Only Admin / Management (the Quotation Request people) can import WhatsApp messages." />;
  const { data: companies } = await supabase.from("companies").select("id, name");
  const sp = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies ?? [], sp.company);
  if (!accessibleIds.includes(SIGNATURE_COMPANY_ID)) return <EmptyRow text="The WhatsApp import is for Signature Solution Sdn Bhd only, and you do not have access to it." />;
  const query = sp.company ? `?company=${sp.company}` : "";

  const db = untyped(supabase);
  const { data: rows } = await db.from("whatsapp_imports").select("*").eq("company_id", SIGNATURE_COMPANY_ID).order("imported_at", { ascending: false }).limit(30);
  const list = (rows ?? []) as ImportRow[];
  let current: ImportRow | null = null;
  if (sp.id && /^[0-9a-f-]{36}$/i.test(sp.id)) {
    current = list.find((r) => r.id === sp.id) ?? (((await db.from("whatsapp_imports").select("*").eq("id", sp.id).maybeSingle()).data as ImportRow | null) ?? null);
  }
  const names = await displayNames(supabase, [...list.map((r) => r.imported_by), current?.imported_by, current?.submitted_by]);
  const recent: RecentImport[] = list.map((r) => ({
    id: r.id,
    importedAt: formatMalaysiaDateTime(r.imported_at),
    by: (r.imported_by && names.get(r.imported_by)) || "—",
    category: r.category,
    status: r.status,
    preview: r.original_message.replace(/\s+/g, " ").slice(0, 90),
    link: linkOf(r, query),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/catering/quotation-requests${query}`} className="text-[12.5px] font-semibold text-text-secondary">
          ← Quotation Request Inbox
        </Link>
        <h1 className="mt-1 text-[22px] font-extrabold text-text">WhatsApp Message Import – AI Smart Extraction</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Signature Solution Sdn Bhd only. Paste the Boss&apos;s WhatsApp message: the AI sorts it into a catering quotation request, JDT match dates or a JDT training snack request, and fills in the form for you to check.
        </p>
      </div>
      <CateringSubNav />

      {current && current.status !== "draft" ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-[15px] font-extrabold text-text">{`${current.status === "submitted" ? "Submitted" : "Set aside"} · ${WA_CATEGORY_LABEL[current.category]}`}</div>
            <div className="mt-1 text-[12.5px] text-text-secondary">
              {`Imported ${formatMalaysiaDateTime(current.imported_at)} by ${(current.imported_by && names.get(current.imported_by)) || "—"}`}
              {current.submitted_at ? ` · submitted ${formatMalaysiaDateTime(current.submitted_at)} by ${(current.submitted_by && names.get(current.submitted_by)) || "—"}` : ""}
              {current.ai_category && current.ai_category !== current.category ? ` · the AI first chose ${WA_CATEGORY_LABEL[current.ai_category]}` : ""}
            </div>
            {linkOf(current, query) && (
              <Link href={linkOf(current, query)!} className="mt-2 inline-block text-[13.5px] font-bold text-primary hover:underline">
                Open what was made from it →
              </Link>
            )}
            <div className="mt-3 text-[12.5px] font-bold text-text">Original WhatsApp message</div>
            <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-alt p-3 text-[13px] text-text">{current.original_message}</pre>
            <details className="mt-3">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-primary">Information as read by the AI</summary>
              <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-alt p-3 text-[11.5px] text-text-secondary">{JSON.stringify(current.ai_result, null, 2)}</pre>
            </details>
            <details className="mt-2">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-primary">Information as checked and submitted by the Admin</summary>
              <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-alt p-3 text-[11.5px] text-text-secondary">{JSON.stringify(current.edited_result ?? current.ai_result, null, 2)}</pre>
            </details>
          </div>
          <Link href={`/catering/quotation-requests/whatsapp${query}`} className="self-start rounded-lg bg-primary px-4 py-2 text-[14px] font-semibold text-white">
            Import a new message
          </Link>
          <WhatsappImport key="recent-only" initialImportId={null} initialMessage="" initialResult={null} recent={recent} query={query} />
        </div>
      ) : (
        <WhatsappImport
          key={current?.id ?? "new"}
          initialImportId={current?.id ?? null}
          initialMessage={current?.original_message ?? ""}
          initialResult={current ? current.edited_result ?? current.ai_result : null}
          recent={recent}
          query={query}
        />
      )}
    </div>
  );
}
