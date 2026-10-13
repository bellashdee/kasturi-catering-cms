import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export type MarkdownOutcome = { status: "done" | "skipped" | "failed"; markdown: string | null; note: string | null };

const MAX_STORED_CHARS = 1_500_000;

function extensionOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext || ".bin";
}

/** Local development only: the Python function is not served by `next dev`, so the same MarkItDown package is run directly. */
async function convertLocally(signedUrl: string, filename: string): Promise<string> {
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error(`file download failed (HTTP ${response.status})`);
  const folder = await mkdtemp(path.join(tmpdir(), "markitdown-"));
  try {
    const file = path.join(folder, `file${extensionOf(filename)}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    return await new Promise<string>((resolve, reject) => {
      execFile(process.env.MARKITDOWN_PYTHON ?? "python", ["-m", "markitdown", file], { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr?.toString().slice(0, 300) || err.message));
        else resolve(stdout.toString());
      });
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function convertOnServer(origin: string, signedUrl: string, filename: string, accessToken: string): Promise<string> {
  const response = await fetch(`${origin}/api/convert_to_markdown`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ url: signedUrl, filename }),
    signal: AbortSignal.timeout(58_000),
  });
  const body = (await response.json().catch(() => null)) as { markdown?: string; message?: string; error?: string } | null;
  if (!response.ok || !body || typeof body.markdown !== "string") {
    throw new Error(body?.message ?? `the conversion service answered HTTP ${response.status}`);
  }
  return body.markdown;
}

/**
 * Makes sure a stored document has its Markdown version (MarkItDown) and returns it. Photos and screenshots have no text
 * to convert, so they are recorded as skipped (the AI reads them visually). A failed conversion never blocks the upload:
 * it is recorded with its reason and can be retried.
 */
export async function ensureDocumentMarkdown(supabase: DB, documentId: string): Promise<MarkdownOutcome> {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, storage_path, original_filename, file_type, markdown_status, markdown_text, markdown_note")
    .eq("id", documentId)
    .single();
  if (error || !doc) return { status: "failed", markdown: null, note: "Document not found." };

  if (doc.markdown_status === "done") return { status: "done", markdown: doc.markdown_text, note: doc.markdown_note };
  if (doc.markdown_status === "skipped") return { status: "skipped", markdown: null, note: doc.markdown_note };

  const record = async (outcome: MarkdownOutcome) => {
    await supabase
      .from("documents")
      .update({ markdown_status: outcome.status, markdown_text: outcome.markdown, markdown_note: outcome.note, markdown_at: new Date().toISOString() })
      .eq("id", documentId);
    return outcome;
  };

  if (doc.file_type === "photo" || doc.file_type === "screenshot") {
    return record({ status: "skipped", markdown: null, note: "Photo / screenshot: there is no text to convert, so the AI reads it visually." });
  }

  try {
    const { data: signed, error: signError } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 300);
    if (signError || !signed) throw new Error("could not open the stored file");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("not signed in");

    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    const origin = `${h.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;

    const markdown = (local ? await convertLocally(signed.signedUrl, doc.original_filename) : await convertOnServer(origin, signed.signedUrl, doc.original_filename, session.access_token)).trim();
    if (!markdown) return record({ status: "done", markdown: "", note: "Converted, but the file has no text (it may be a scan)." });
    return record({ status: "done", markdown: markdown.slice(0, MAX_STORED_CHARS), note: markdown.length > MAX_STORED_CHARS ? "Very long file: the Markdown was cut at 1.5 million characters." : null });
  } catch (err) {
    return record({ status: "failed", markdown: null, note: `Markdown conversion failed: ${err instanceof Error ? err.message : "unknown error"}`.slice(0, 400) });
  }
}
