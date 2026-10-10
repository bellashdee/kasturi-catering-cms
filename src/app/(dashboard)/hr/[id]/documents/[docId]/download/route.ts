import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Secure download of one HR document. The document row and the storage file are both read with the signed-in
 * user's own session, so the database policies decide: HR Admins of the company, or the employee themself
 * (only when HR marked it visible). Everyone else gets "not found". The link handed out lives 60 seconds.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Please sign in.", { status: 401 });

  const { data: doc } = await supabase
    .from("employee_documents")
    .select("storage_path, original_filename")
    .eq("id", docId)
    .eq("employee_id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("Document not found.", { status: 404 });

  const { data, error } = await supabase.storage
    .from("hr-documents")
    .createSignedUrl(doc.storage_path, 60, { download: doc.original_filename });
  if (error || !data) return new NextResponse("Document not available.", { status: 404 });

  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
