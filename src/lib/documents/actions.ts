"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDocumentMarkdown } from "@/lib/documents/markdown";

/**
 * The "documents" bucket is private (see documents_bucket_select storage
 * policy) — a signed URL is the only way to view/download a file, and it's
 * time-limited so links can't be shared indefinitely. RLS on both the
 * `documents` row and the storage object itself already restrict this to
 * users with access to the document's company.
 */
export async function getDocumentSignedUrl(documentId: string, download = false): Promise<string> {
  let supabase = await createClient();

  let { data: doc } = await supabase.from("documents").select("storage_path, original_filename").eq("id", documentId).maybeSingle();
  if (!doc) {
    // not one of the person's companies: they can still open a file they sent themselves (a receipt of their own claim)
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const admin = createAdminClient();
    const { data: own } = await admin.from("documents").select("storage_path, original_filename, uploaded_by").eq("id", documentId).maybeSingle();
    if (!user || !own || own.uploaded_by !== user.id) throw new Error("Document not found.");
    doc = own;
    supabase = admin as unknown as typeof supabase;
  }

  // download = the browser saves the file under its original name instead of showing it
  const { data, error: urlError } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 300, download ? { download: doc.original_filename } : undefined);
  if (urlError || !data) throw new Error("Could not generate a viewing link.");

  // open the file through this site's own address too (same reason as the browser client: supabase.co may not be reachable)
  const direct = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (direct && host && data.signedUrl.startsWith(direct)) {
    const proto = h.get("x-forwarded-proto") ?? (/^localhost|^127./.test(host) ? "http" : "https");
    return data.signedUrl.replace(direct, `${proto}://${host}/supabase`);
  }
  return data.signedUrl;
}

/**
 * Converts a freshly uploaded document to Markdown (MarkItDown) and stores it with the document. Called right after every
 * upload; never throws, so an upload is never lost because the conversion had a problem.
 */
export async function generateDocumentMarkdown(documentId: string): Promise<{ status: "done" | "skipped" | "failed"; note: string | null }> {
  try {
    const supabase = await createClient();
    const outcome = await ensureDocumentMarkdown(supabase, documentId);
    return { status: outcome.status, note: outcome.note };
  } catch (err) {
    return { status: "failed", note: err instanceof Error ? err.message : "Markdown conversion failed." };
  }
}
