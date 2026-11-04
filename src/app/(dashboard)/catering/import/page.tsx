import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { CateringSubNav } from "@/components/catering/CateringSubNav";
import { EventImportFlow } from "@/components/catering/EventImportFlow";
import { formatMalaysiaDateTime } from "@/lib/format";

/** Importing confirmed events from the office's Excel file: only Ms. Nabilah, Mr. Adlan and Ms. Penny. */
export default async function ImportEventsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("user_has_quotation_request_access");

  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { company: requestedId } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;

  const { data: history } =
    allowed === true
      ? await supabase
          .from("event_import_batches")
          .select("id, file_name, sheet_name, imported_at, created_count, updated_count, skipped_count, company_id, importer:profiles!event_import_batches_imported_by_fkey(full_name)")
          .in("company_id", accessibleIds)
          .order("imported_at", { ascending: false })
          .limit(20)
      : { data: [] };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Import Confirmed Events</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Upload the Excel list of confirmed events. Every row is checked against the saved events (Event ID, and the same date with the same customer, name or
          venue) and shown before anything is saved; only CONFIRM IMPORT creates or updates events, which then appear on the calendar.
        </p>
      </div>

      <CateringSubNav />

      {allowed !== true ? (
        <div className="mx-auto mt-6 max-w-lg rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
          <div className="text-[16px] font-extrabold text-text">Import Confirmed Events</div>
          <p className="mt-2 text-[13px] text-text-secondary">Only Ms. Nabilah, Mr. Adlan and Ms. Penny can import confirmed events.</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <EventImportFlow companies={selectable} defaultCompanyId={defaultCompanyId} />
          </div>

          <div className="rounded-xl border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-5 py-3 text-[13px] font-bold text-text">Import history</div>
            {(history ?? []).length === 0 ? (
              <div className="px-5 py-4 text-[13px] text-text-muted">No import yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[12.5px]">
                  <thead className="bg-surface-alt text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    <tr>
                      <th className="px-4 py-2">When</th>
                      <th className="px-4 py-2">File</th>
                      <th className="px-4 py-2">Company</th>
                      <th className="px-4 py-2">By</th>
                      <th className="px-4 py-2">Created</th>
                      <th className="px-4 py-2">Updated</th>
                      <th className="px-4 py-2">Skipped</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(history ?? []).map((h) => (
                      <tr key={h.id}>
                        <td className="px-4 py-2">{formatMalaysiaDateTime(h.imported_at)}</td>
                        <td className="px-4 py-2 font-semibold text-text">{h.file_name}{h.sheet_name ? <span className="font-normal text-text-muted"> · {h.sheet_name}</span> : null}</td>
                        <td className="px-4 py-2">{companies.find((c) => c.id === h.company_id)?.name ?? "—"}</td>
                        <td className="px-4 py-2">{h.importer?.full_name ?? "—"}</td>
                        <td className="px-4 py-2">{h.created_count}</td>
                        <td className="px-4 py-2">{h.updated_count}</td>
                        <td className="px-4 py-2">{h.skipped_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
