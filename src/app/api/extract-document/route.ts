import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EXTRACTION_PROMPTS: Record<string, string> = {
  employee_certificate: `You are reading a staff certificate or work permit (food handling certificate, typhoid certificate, work permit, or training certificate). Extract the following fields from the image/document and respond with ONLY a JSON object, no other text:
{
  "cert_type": one of "food_handling" | "typhoid" | "work_permit" | "training" | "other",
  "cert_name": the certificate's title as printed,
  "cert_number": the certificate/reference number if visible, else null,
  "issued_date": ISO date (YYYY-MM-DD) if visible, else null,
  "expiry_date": ISO date (YYYY-MM-DD) if visible, else null,
  "holder_name": the certificate holder's name as printed, else null
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
  purchase_receipt: `You are reading a supplier delivery order or purchase receipt for kitchen ingredients. Extract every line item and respond with ONLY a JSON object, no other text:
{
  "supplier_name": the supplier's name as printed, else null,
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
};

function mimeTypeFor(filename: string, fallback: "pdf" | "photo" | "screenshot"): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (fallback === "pdf" || ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
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

  if (doc.file_type !== "pdf" && doc.file_type !== "photo" && doc.file_type !== "screenshot") {
    return NextResponse.json(
      { error: "This document type doesn't use AI extraction — read the file directly instead." },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await supabase.from("documents").update({ extraction_status: "manual" }).eq("id", documentId);
    return NextResponse.json({
      configured: false,
      message:
        "AI extraction isn't configured yet (no ANTHROPIC_API_KEY set). Fill in the fields below manually — the file is already saved and attached.",
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
  const prompt = EXTRACTION_PROMPTS[kind] ?? EXTRACTION_PROMPTS.employee_certificate;

  try {
    const anthropic = new Anthropic({ apiKey });

    const fileContentBlock =
      mediaType === "application/pdf"
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
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [fileContentBlock, { type: "text", text: prompt }],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
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
