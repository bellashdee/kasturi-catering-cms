"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, type ActionResult } from "@/lib/actionResult";
import type { DocumentFileType } from "@/lib/documents/upload";

/**
 * A receipt / photo of a petty cash record or a claim, sent by any signed-in staff member for any of the companies (a staff claim can
 * be for a company the person does not work for). The file goes straight from the browser to storage with a one-time upload pass, so
 * there is no size limit of the website in between; its record is filed under the company and the person who sent it.
 */
export async function startReceiptUpload(input: { companyId: string; name: string; type: string; fileType: DocumentFileType }): Promise<ActionResult<{ id: string; path: string; token: string }>> {
  return runAction(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");
    const admin = createAdminClient();
    const { data: company } = await admin.from("companies").select("id").eq("id", input.companyId).maybeSingle();
    if (!company) throw new Error("Choose the company the receipt is for.");
    const ext = (input.name.split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin";
    const path = `${input.companyId}/${crypto.randomUUID()}.${ext}`;
    const { data: pass, error: passError } = await admin.storage.from("documents").createSignedUploadUrl(path);
    if (passError || !pass) throw new Error("Could not prepare the upload. Please try again.");
    const { data: doc, error } = await admin
      .from("documents")
      .insert({ company_id: input.companyId, module: "finance", file_type: input.fileType, storage_path: path, original_filename: input.name.slice(0, 255), uploaded_by: user.id })
      .select("id")
      .single();
    if (error || !doc) throw new Error("Could not prepare the upload. Please try again.");
    return { id: doc.id, path: pass.path, token: pass.token };
  }, "Could not prepare the upload. Please try again.");
}
