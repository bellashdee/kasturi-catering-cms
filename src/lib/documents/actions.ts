"use server";

import { createClient } from "@/lib/supabase/server";

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

  return data.signedUrl;
}
