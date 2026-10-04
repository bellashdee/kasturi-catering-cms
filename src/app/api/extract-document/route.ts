import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { geminiGenerate, getAiProvider } from "@/lib/ai/gemini";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const EXTRACTION_PROMPTS: Record<string, string> = {
  employee_certificate: `You are reading a staff document: a food handling certificate, typhoid certificate, work permit, training certificate, medical certificate (MC), confirmation letter, or letter of appointment/offer (LOA). Extract the following fields from the image/document and respond with ONLY a JSON object, no other text:
{
  "cert_type": one of "food_handling" | "typhoid" | "work_permit" | "training" | "medical_certificate" | "confirmation_letter" | "loa" | "other",
  "cert_name": the document's title as printed,
  "cert_number": the certificate/reference number if visible, else null,
  "issued_date": ISO date (YYYY-MM-DD) if visible (for an MC use its first day of leave), else null,
  "expiry_date": ISO date (YYYY-MM-DD) if visible (for an MC use its last day of leave; confirmation letters and LOAs have none), else null,
  "holder_name": the person's name as printed, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  company_document: `You are reading a company licence or agreement: an MBJB (Majlis Bandaraya Johor Bahru) business licence, a Halal certificate/licence, a tenancy agreement, or a similar document. Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "doc_type": one of "mbjb_licence" | "halal_licence" | "tenancy_agreement" | "other",
  "title": the document's title or the premises/business it covers, as printed,
  "reference_number": the licence/certificate/agreement number if visible, else null,
  "issued_date": ISO date (YYYY-MM-DD) the licence starts or the agreement is dated, if visible, else null,
  "expiry_date": ISO date (YYYY-MM-DD) the licence expires or the tenancy ends, if visible, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  marketing_expense: `You are reading a receipt or invoice for a marketing expense (ad spend, printing, event cost, influencer payment, etc). Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "category": one of "advertising" | "print" | "event" | "influencer" | "content_production" | "other",
  "description": a short description of what this expense was for (e.g. vendor name + item),
  "amount": the total amount as a plain number (no currency symbol), else null,
  "expense_date": ISO date (YYYY-MM-DD) if visible, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  campaign_performance: `You are reading a screenshot of social media or ad platform analytics (e.g. Instagram Insights, Facebook Ads Manager, Google Ads). Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "report_date": ISO date (YYYY-MM-DD) the data is for, if visible, else null,
  "impressions": total impressions/reach as a plain integer, else null,
  "clicks": total clicks/link clicks as a plain integer, else null,
  "leads_generated": total leads/enquiries as a plain integer, else null,
  "conversions": total conversions/results as a plain integer, else null,
  "spend": amount spent as a plain number (no currency symbol), else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  stock_count: `You are reading a photo or screenshot of a kitchen stock count (a shelf, a stock sheet, or a handwritten count list). Extract every ingredient and its counted quantity and respond with ONLY a JSON object, no other text:
{
  "items": [
    { "ingredient_name": "as written or best guess", "quantity": a plain number, "unit": "kg" | "g" | "l" | "ml" | "pcs" | "pack" | "other" | null }
  ]
}
List every distinct item you can identify. If a quantity is not legible, omit that item rather than guessing.`,
  customer_event_invoice: `You are reading an invoice or order sheet issued to a customer for a catering event. Stock will be deducted for what was supplied, so list every line item (a food item, dish, ingredient or supply, whatever is written) with its quantity. Respond with ONLY a JSON object, no other text:
{
  "customer_name": the customer's name as printed, else null,
  "event_name": the event name or description if shown, else null,
  "invoice_number": the invoice number as printed, else null,
  "invoice_date": ISO date (YYYY-MM-DD) if visible, else null,
  "items": [
    { "ingredient_name": "the item exactly as written", "quantity": a plain number, "unit": "kg" | "g" | "l" | "ml" | "pcs" | "pack" | "other" | null }
  ]
}
List every distinct line item. If a quantity is not legible, omit that item rather than guessing.`,
  purchase_receipt: `You are reading a supplier invoice, delivery order or purchase receipt for kitchen ingredients. Extract every line item and respond with ONLY a JSON object, no other text:
{
  "supplier_name": the supplier's name as printed, else null,
  "invoice_number": the invoice or delivery order number as printed, else null,
  "receipt_date": ISO date (YYYY-MM-DD) if visible, else null,
  "items": [
    { "ingredient_name": "as written on the receipt", "quantity": a plain number, "unit": "kg" | "g" | "l" | "ml" | "pcs" | "pack" | "other" | null, "unit_price": a plain number if visible, else null }
  ]
}
List every distinct line item. If a quantity or price is not legible, omit that field rather than guessing.`,
  driver_expense_receipt: `You are reading a receipt for a vehicle/delivery running cost (fuel, toll, parking, or another vehicle-related expense). Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "category": one of "fuel" | "toll" | "parking" | "mileage" | "other",
  "description": a short description of what this expense was for (e.g. vendor/station name),
  "amount": the total amount as a plain number (no currency symbol), else null,
  "expense_date": ISO date (YYYY-MM-DD) if visible, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  vehicle_service_receipt: `You are reading a vehicle workshop invoice or service record. Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "service_date": ISO date (YYYY-MM-DD) the service was done, if visible, else null,
  "next_service_date": ISO date (YYYY-MM-DD) of the next recommended service, if visible, else null,
  "cost": the total cost as a plain number (no currency symbol), else null,
  "notes": a short description of the work done, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  supplier_invoice: `You are reading a supplier invoice or bill. Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "supplier_name": the supplier/vendor's name as printed, else null,
  "invoice_number": the invoice number as printed, else null,
  "invoice_date": ISO date (YYYY-MM-DD) if visible, else null,
  "due_date": ISO date (YYYY-MM-DD) if visible, else null,
  "amount": the total amount payable as a plain number (no currency symbol), else null,
  "items": [
    { "item_name": "as written on the invoice", "quantity": a plain number, "unit_price": a plain number if visible, else null }
  ]
}
List every distinct line item you can identify. If a field is not legible or you are not confident, use null for it rather than guessing.`,
  company_expense: `You are reading a receipt or invoice for a general company expense (utilities, rent, office supplies, insurance, etc). Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "category": a short category name as best guess (e.g. "Utilities", "Rent & Facilities", "Supplies & Equipment", "Other"),
  "description": a short description of what this expense was for (e.g. vendor name + item),
  "amount": the total amount as a plain number (no currency symbol), else null,
  "expense_date": ISO date (YYYY-MM-DD) if visible, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  customer_invoice: `You are reading an invoice this company issued to one of its own customers. Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "invoice_number": the invoice number as printed, else null,
  "invoice_date": ISO date (YYYY-MM-DD) if visible, else null,
  "due_date": ISO date (YYYY-MM-DD) if visible, else null,
  "description": a short description of what the invoice is for, else null,
  "amount": the subtotal amount before tax as a plain number (no currency symbol), else null,
  "tax_amount": the tax/SST amount as a plain number if shown separately, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
};

/** Excel/CSV can't be shown to the model as an image, so flatten every sheet to CSV text (capped so a huge file can't blow the request). */
function spreadsheetToText(buffer: ArrayBuffer, limit = 60000): string {
  const wb = XLSX.read(buffer, { type: "array" });
  const parts = wb.SheetNames.map((name) => `--- Sheet: ${name} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false })}`);
  const text = parts.join("\n\n");
  return text.length > 60000 ? `${text.slice(0, 60000)}\n[truncated]` : text;
}

function mimeTypeFor(filename: string, fallback: "pdf" | "photo" | "screenshot"): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (fallback === "pdf" || ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  return "image/jpeg";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const documentId: string | undefined = body?.documentId;
  const kind: string = body?.kind ?? "employee_certificate";

  if (!documentId) {
    return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const isSpreadsheet = doc.file_type === "excel" || doc.file_type === "csv";
  if (!isSpreadsheet && doc.file_type !== "pdf" && doc.file_type !== "photo" && doc.file_type !== "screenshot") {
    return NextResponse.json({ error: "This file type isn't supported for reading." }, { status: 400 });
  }

  const provider = getAiProvider();
  if (!provider) {
    await supabase.from("documents").update({ extraction_status: "manual" }).eq("id", documentId);
    return NextResponse.json({
      configured: false,
      message:
        "AI extraction isn't configured yet (no ANTHROPIC_API_KEY or GEMINI_API_KEY set). Fill in the fields below manually — the file is already saved and attached.",
    });
  }

  await supabase.from("documents").update({ extraction_status: "processing" }).eq("id", documentId);

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);

  if (downloadError || !fileBlob) {
    await supabase.from("documents").update({ extraction_status: "failed" }).eq("id", documentId);
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 500 });
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const base64Data = Buffer.from(arrayBuffer).toString("base64");
  const mediaType = mimeTypeFor(doc.original_filename, doc.file_type as "pdf" | "photo" | "screenshot");
  if (provider === "anthropic" && (mediaType === "image/heic" || mediaType === "image/heif")) {
    await supabase.from("documents").update({ extraction_status: "failed" }).eq("id", documentId);
    return NextResponse.json({ error: "iPhone HEIC photos can't be read. Take a screenshot or save the photo as JPG/PNG." }, { status: 400 });
  }
  if (!isSpreadsheet && arrayBuffer.byteLength > 14 * 1024 * 1024) {
    await supabase.from("documents").update({ extraction_status: "failed" }).eq("id", documentId);
    return NextResponse.json({ error: "The file is too large to read (over 14 MB). Upload a smaller or compressed copy." }, { status: 400 });
  }
  const prompt = EXTRACTION_PROMPTS[kind] ?? EXTRACTION_PROMPTS.employee_certificate;

  try {
    let raw = "";

    if (provider === "gemini") {
      const filePart = isSpreadsheet
        ? { text: `The uploaded file is a spreadsheet. Its contents, sheet by sheet, as CSV:

${spreadsheetToText(arrayBuffer, 400000)}` }
        : { inline_data: { mime_type: mediaType, data: base64Data } };
      raw = await geminiGenerate({
        turns: [{ role: "user", parts: [filePart, { text: prompt }] }],
        maxOutputTokens: 4096,
        json: true,
      });
    } else {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const fileContentBlock = isSpreadsheet
      ? ({ type: "text", text: `The uploaded file is a spreadsheet. Its contents, sheet by sheet, as CSV:\n\n${spreadsheetToText(arrayBuffer)}` } as const)
      : mediaType === "application/pdf"
        ? ({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64Data },
          } as const)
        : ({
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: base64Data,
            },
          } as const);

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [fileContentBlock, { type: "text", text: prompt }],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    raw = textBlock && "text" in textBlock ? textBlock.text : "";
    }
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!extracted) {
      await supabase.from("documents").update({ extraction_status: "failed" }).eq("id", documentId);
      return NextResponse.json({ error: "Could not parse a result from the AI response." }, { status: 502 });
    }

    await supabase
      .from("documents")
      .update({ extraction_status: "extracted", extracted_data: extracted })
      .eq("id", documentId);

    return NextResponse.json({ configured: true, extracted });
  } catch (err) {
    await supabase.from("documents").update({ extraction_status: "failed" }).eq("id", documentId);
    const message = err instanceof Error ? err.message : "Extraction failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
