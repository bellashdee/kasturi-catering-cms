"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setEmployeePhoto } from "@/lib/hr/employeeActions";
import { EMPLOYEE_PHOTO_MAX_BYTES, EMPLOYEE_PHOTO_MIME_TYPES } from "@/lib/hr/constants";

/** HR-only: uploads a profile photo (JPG/PNG, max 2 MB) into the private bucket and links it to the employee. */
export function PhotoUpload({ employeeId, companyId }: { employeeId: string; companyId: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange() {
    const file = ref.current?.files?.[0];
    if (!file) return;
    setError(null);
    if (!EMPLOYEE_PHOTO_MIME_TYPES.includes(file.type)) return setError("Use a JPG or PNG photo.");
    if (file.size > EMPLOYEE_PHOTO_MAX_BYTES) return setError("The photo is larger than 2 MB.");
    setBusy(true);
    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${companyId}/photos/${employeeId}.${ext}`;
    try {
      const { error: uploadError } = await createClient().storage.from("hr-documents").upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw new Error("The photo could not be uploaded. Try again.");
      await setEmployeePhoto(employeeId, path);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="mt-1">
      <label className="cursor-pointer text-[12px] font-semibold text-primary">
        {busy ? "Uploading..." : "Change photo"}
        <input ref={ref} type="file" accept="image/jpeg,image/png" onChange={onChange} disabled={busy} className="sr-only" />
      </label>
      {error && <p role="alert" className="text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}
