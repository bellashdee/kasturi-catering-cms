"use client";

import { useState } from "react";

/** Shows a link of this site (by path) with a button that copies the full address, for sharing on WhatsApp. */
export function CopyLink({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-text">{label}</div>
        <div className="truncate text-[12px] text-text-muted">{path}</div>
      </div>
      <button type="button" onClick={() => void copy()} className="h-8 shrink-0 rounded-md border border-border-strong bg-surface px-3 text-[12.5px] font-semibold text-text hover:bg-bg">
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
