"use client";

import { useState } from "react";
import { getDocumentSignedUrl } from "@/lib/documents/actions";

/**
 * Opens a private "documents" bucket file in a new tab via a freshly
 * generated signed URL. Reusable anywhere a document/photo needs viewing —
 * attendance photos, delivery proof, receipts, certificates, etc.
 */
export function DocumentViewLink({
  documentId,
  label = "📷 View",
  className,
}: {
  documentId: string;
  label?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function open() {
    setLoading(true);
    setError(false);
    try {
      const url = await getDocumentSignedUrl(documentId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={open}
      disabled={loading}
      className={className ?? "text-[12.5px] font-semibold text-primary hover:underline disabled:opacity-50"}
    >
      {loading ? "Opening…" : error ? "Could not open — retry" : label}
    </button>
  );
}
