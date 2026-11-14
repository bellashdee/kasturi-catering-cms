"use client";

import { useState } from "react";
import { getDocumentSignedUrl } from "@/lib/documents/actions";
import { reserveTab } from "@/lib/openTab";

/**
 * Opens a private "documents" bucket file in a new tab via a freshly
 * generated signed URL. Reusable anywhere a document/photo needs viewing —
 * attendance photos, delivery proof, receipts, certificates, etc.
 * With `download` the file is saved to the computer (under its original name) instead of opened.
 */
export function DocumentViewLink({
  documentId,
  label = "📷 View",
  className,
  download = false,
}: {
  documentId: string;
  label?: string;
  className?: string;
  download?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function open() {
    // the new tab is opened at the tap itself (phones block one opened after the wait for the link)
    const tab = download ? null : reserveTab();
    setLoading(true);
    setError(false);
    try {
      const url = await getDocumentSignedUrl(documentId, download);
      if (tab) tab.go(url);
      else window.location.assign(url);
    } catch {
      tab?.cancel();
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
