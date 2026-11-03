"use client";

import { createClient } from "@/lib/supabase/client";
import { addStaffFile } from "@/lib/hr/staffFileActions";

export const STAFF_FILE_KIND_LABEL: Record<string, string> = {
  warning_letter: "Warning Letter",
  confirmation_letter: "Confirmation Letter",
  offer_letter: "Offer Letter",
  probation_extension_letter: "Probation Extension Letter",
  personal_information: "Personal Information Form",
  other: "Other",
};

/** Uploads a file to the private staff-files bucket (under the staff record's own folder) and records it. Only a Super Admin can. */
export async function uploadStaffFile(input: { employeeId: string; kind: string; title: string; issuedDate?: string; file: File }): Promise<{ ok: true; fileId: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const ext = (input.file.name.split(".").pop() || "bin").toLowerCase();
  const storagePath = `${input.employeeId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("staff-files").upload(storagePath, input.file, { contentType: input.file.type || undefined });
  if (error) return { ok: false, error: "The file could not be uploaded. Only Madam Penny or Nabilah can add staff files." };
  const result = await addStaffFile({
    employeeId: input.employeeId,
    kind: input.kind,
    title: input.title,
    issuedDate: input.issuedDate,
    storagePath,
    originalFilename: input.file.name,
    contentType: input.file.type || undefined,
    fileSize: input.file.size,
  });
  if (!result.ok) {
    await supabase.storage.from("staff-files").remove([storagePath]);
    return { ok: false, error: result.error };
  }
  return { ok: true, fileId: result.fileId };
}
