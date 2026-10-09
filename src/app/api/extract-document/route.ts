import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai/gemini";
import { createClient } from "@/lib/supabase/server";
import { ExtractionError } from "@/lib/extraction/errors";
import { runExtraction } from "@/lib/extraction/run";

export const runtime = "nodejs";
export const maxDuration = 60;

const SUPPORTED_TYPES = ["excel", "csv", "pdf", "photo", "screenshot"];

/**
 * Reads an uploaded document (PDF incl. scanned, image, Excel, CSV) and returns the extracted fields.
 * `extracted` keeps the flat shape every module form already consumes; `report` adds what a reviewer needs:
 * detected document type, per-field source page / confidence / notes, line-item tables, figure checks and issues.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const documentId: string | undefined = body?.documentId;
  const kind: string = body?.kind ?? "employee_certificate";

  if (!documentId) {
    return NextResponse.json({ error: "documentId is required", code: "bad_request" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: doc, error: docError } = await supabase.from("documents").select("*").eq("id", documentId).single();
  if (docError || !doc) {
    return NextResponse.json({ error: "Document not found", code: "not_found" }, { status: 404 });
  }

  if (!SUPPORTED_TYPES.includes(doc.file_type)) {
    return NextResponse.json({ error: "This file type isn't supported for reading.", code: "unsupported_file" }, { status: 400 });
  }

  const provider = getAiProvider();
  if (!provider) {
    await supabase.from("documents").update({ extraction_status: "manual" }).eq("id", documentId);
    return NextResponse.json({
      configured: false,
      message: "AI extraction isn't configured yet (no ANTHROPIC_API_KEY or GEMINI_API_KEY set). Fill in the fields below manually — the file is already saved and attached.",
    });
  }

  await supabase.from("documents").update({ extraction_status: "processing" }).eq("id", documentId);

  const { data: fileBlob, error: downloadError } = await supabase.storage.from("documents").download(doc.storage_path);
  if (downloadError || !fileBlob) {
    await supabase.from("documents").update({ extraction_status: "failed" }).eq("id", documentId);
    const err = new ExtractionError("download_failed", "The uploaded file could not be retrieved from storage.", "Upload the file again.", 500);
    return NextResponse.json(err.toBody(), { status: err.status });
  }

  try {
    const { extracted, report } = await runExtraction({
      buffer: await fileBlob.arrayBuffer(),
      filename: doc.original_filename,
      fileType: doc.file_type,
      kind,
      provider,
    });

    await supabase.from("documents").update({ extraction_status: "extracted", extracted_data: extracted as never }).eq("id", documentId);
    return NextResponse.json({ configured: true, extracted, report });
  } catch (err) {
    await supabase.from("documents").update({ extraction_status: "failed" }).eq("id", documentId);
    if (err instanceof ExtractionError) return NextResponse.json(err.toBody(), { status: err.status });
    const message = err instanceof Error ? err.message : "Extraction failed.";
    const wrapped = new ExtractionError("unexpected", `Reading the file failed unexpectedly (${message}).`, "Try again; if it keeps failing, enter the details manually.", 500);
    return NextResponse.json(wrapped.toBody(), { status: wrapped.status });
  }
}
