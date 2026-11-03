"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";

const BUCKET = "staff-files";

/**
 * A short-lived link to view or download a staff file. The database decides who may: only a Super Admin and the staff member
 * the file belongs to can read the row and the file, so asking for someone else's file gets "not found".
 */
export async function getStaffFileUrl(fileId: string, download = false): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const supabase = await createClient();
    const { data: file } = await supabase.from("employee_files").select("storage_path, original_filename").eq("id", fileId).maybeSingle();
    if (!file) throw new Error("This file was not found.");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path, 300, download ? { download: file.original_filename } : undefined);
    if (error || !data) throw new Error("Could not open this file.");

    // open the file through this site's own address too (supabase.co may not be reachable from every network)
    const direct = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (direct && host && data.signedUrl.startsWith(direct)) {
      const proto = h.get("x-forwarded-proto") ?? (/^localhost|^127./.test(host) ? "http" : "https");
      return { url: data.signedUrl.replace(direct, `${proto}://${host}/supabase`) };
    }
    return { url: data.signedUrl };
  });
}

export type StaffFileInput = {
  employeeId: string;
  kind: string;
  title: string;
  issuedDate?: string;
  /** the file already uploaded to the staff-files bucket: "<employee id>/<file name>" */
  storagePath: string;
  originalFilename: string;
  contentType?: string;
  fileSize?: number;
};

/** Records a staff file that was just uploaded. Only the Super Admins (the bucket and the table both enforce it). */
export async function addStaffFile(input: StaffFileInput): Promise<ActionResult<{ fileId: string }>> {
  return runAction(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");
    if (!input.title.trim()) throw new Error("Write a name for the file.");
    if (!input.storagePath.startsWith(`${input.employeeId}/`)) throw new Error("The file is not in this staff member's folder.");
    if (input.issuedDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.issuedDate)) throw new Error("Enter a valid date.");
    const { data: employee } = await supabase.from("employees").select("company_id").eq("id", input.employeeId).maybeSingle();
    if (!employee) throw new Error("This staff record was not found.");
    const { data, error } = await supabase
      .from("employee_files")
      .insert({
        employee_id: input.employeeId,
        company_id: employee.company_id,
        kind: input.kind,
        title: input.title.trim(),
        issued_date: input.issuedDate || null,
        storage_path: input.storagePath,
        original_filename: input.originalFilename,
        content_type: input.contentType ?? null,
        file_size: input.fileSize ?? null,
        uploaded_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error("Only Madam Penny or Nabilah can add staff files.");
    revalidatePath(`/hr/${input.employeeId}`);
    return { fileId: data.id };
  });
}

/** Removes a staff file (the file and its record). Only the Super Admins. */
export async function deleteStaffFile(fileId: string): Promise<ActionResult> {
  return runAction(async () => {
    const supabase = await createClient();
    const { data: file } = await supabase.from("employee_files").select("employee_id, storage_path").eq("id", fileId).maybeSingle();
    if (!file) throw new Error("This file was not found.");
    const { error: rowError } = await supabase.from("employee_files").delete().eq("id", fileId);
    if (rowError) throw new Error("Only Madam Penny or Nabilah can remove staff files.");
    await supabase.storage.from(BUCKET).remove([file.storage_path]);
    revalidatePath(`/hr/${file.employee_id}`);
    return {};
  });
}
