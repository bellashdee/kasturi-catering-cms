import { createClient } from "@/lib/supabase/client";
import { generateDocumentMarkdown } from "@/lib/documents/actions";
import { startReceiptUpload } from "@/lib/documents/receiptUpload";

export type DocumentFileType = "pdf" | "excel" | "csv" | "photo" | "screenshot" | "word" | "powerpoint" | "text" | "other";

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
  /** photos that are only read by the AI (not filed as records) skip the Markdown conversion, which only slows the upload */
  skipMarkdown?: boolean;
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

  // Every uploaded file is converted to Markdown (MarkItDown) first. A conversion problem is recorded with its reason and never loses the upload.
  if (!params.skipMarkdown) {
    try {
      await generateDocumentMarkdown(data.id);
    } catch {
      /* the document is saved; the Markdown can be generated again later */
    }
  }
  return data;
}

/**
 * Sends one receipt / photo of a petty cash record or a claim (any signed-in staff member, any of the companies, any size): the
 * server gives a one-time upload pass and the file goes straight to storage. Returns the document id.
 */
export async function uploadReceipt(companyId: string, file: File): Promise<string> {
  const pass = await startReceiptUpload({ companyId, name: file.name, type: file.type, fileType: fileTypeFromMime(file) });
  if (!pass.ok) throw new Error(pass.error);
  const { error } = await createClient().storage.from("documents").uploadToSignedUrl(pass.path, pass.token, file, { contentType: file.type || undefined });
  if (error) throw new Error(`${file.name} could not be uploaded. Check your connection and try again.`);
  return pass.id;
}

/** Files the AI Assistant can read besides photos and PDFs: Word, Excel, CSV, PowerPoint, text. */
export const ASSISTANT_FILE_ACCEPT = "image/*,application/pdf,.docx,.doc,.xlsx,.xls,.csv,.pptx,.txt,.md,.json,.rtf,.html";

export function fileTypeFromMime(file: File): DocumentFileType {
  if (file.type === "application/pdf") return "pdf";
  if (file.name.match(/\.(docx?|rtf)$/i) || file.type.includes("wordprocessingml") || file.type === "application/msword") return "word";
  if (file.name.match(/\.pptx?$/i) || file.type.includes("presentationml")) return "powerpoint";
  if (file.name.match(/\.(txt|md|json|html?)$/i) || file.type.startsWith("text/") && file.type !== "text/csv") return "text";
  if (file.type.includes("sheet") || file.name.match(/\.(xlsx|xls)$/i)) return "excel";
  if (file.type === "text/csv" || file.name.match(/\.csv$/i)) return "csv";
  return "photo";
}
