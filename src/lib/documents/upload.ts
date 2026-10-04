import { createClient } from "@/lib/supabase/client";

export type DocumentFileType = "pdf" | "excel" | "csv" | "photo" | "screenshot";

/** What the "document" file picker accepts everywhere; photos/screenshots use "image/*". */
export const DOCUMENT_FILE_ACCEPT = "application/pdf,.xlsx,.xls,.csv";
/** Any supported file (PDF, Excel, CSV, photo, screenshot) in a single picker. */
export const ANY_UPLOAD_ACCEPT = "application/pdf,image/*,.xlsx,.xls,.csv";

export type UploadedDocument = {
  id: string;
  storage_path: string;
};

/**
 * Uploads a file to the shared "documents" storage bucket and creates its
 * tracking row. Reusable by any module — HR certificates today, supplier
 * invoices / receipts / anything else later.
 */
export async function uploadDocument(params: {
  companyId: string;
  module: string;
  fileType: DocumentFileType;
  file: File;
}): Promise<UploadedDocument> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ext = params.file.name.split(".").pop() || "bin";
  const path = `${params.companyId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, params.file, { contentType: params.file.type || undefined });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("documents")
    .insert({
      company_id: params.companyId,
      module: params.module,
      file_type: params.fileType,
      storage_path: path,
      original_filename: params.file.name,
      uploaded_by: user?.id,
    })
    .select("id, storage_path")
    .single();

  if (error) throw error;
  return data;
}

export function fileTypeFromMime(file: File): DocumentFileType {
  if (file.type === "application/pdf") return "pdf";
  if (file.type.includes("sheet") || file.name.match(/\.(xlsx|xls)$/i)) return "excel";
  if (file.type === "text/csv" || file.name.match(/\.csv$/i)) return "csv";
  return "photo";
}
