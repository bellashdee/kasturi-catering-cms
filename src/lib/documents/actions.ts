"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ensureDocumentMarkdown } from "@/lib/documents/markdown";

/**
 * The "documents" bucket is private (see documents_bucket_select storage
 * policy) — a signed URL is the only way to view/download a file, and it's
 * time-limited so links can't be shared indefinitely. RLS on both the
 * `documents` row and the storage object itself already restrict this to
 * users with access to the document's company.
 */
export async function getDocumentSignedUrl(documentId: string): Promise<string> {
  const supabase = await createClient();

  const { data: doc, error } = await supabase.from("documents").select("storage_path").eq("id", documentId).single();
  if (error || !doc) throw new Error("Document not found.");

  const { data, error: urlError } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 300);
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
