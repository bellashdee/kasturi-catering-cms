"use client";

import { getPaymentProofUrl } from "@/lib/finance/paymentProofActions";

export type ProofPrintDetails = {
  invoiceNumber: string;
  company?: string | null;
  customer?: string | null;
  paidDate?: string | null;
  method?: string | null;
  amount?: string | null;
  reference?: string | null;
  sentBy?: string | null;
  remarks?: string | null;
  status?: string | null;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Prints in a hidden frame on this page, so the print window opens straight away. */
function printInFrame(setup: (frame: HTMLIFrameElement) => void, waitForImage: boolean) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const fire = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      /* ignored: handled by the caller's fallback */
    }
    setTimeout(() => frame.remove(), 60_000);
  };
  frame.onload = () => {
    if (!waitForImage) return void setTimeout(fire, 600);
    const img = frame.contentDocument?.querySelector("img");
    if (!img || img.complete) fire();
    else {
      img.onload = fire;
      img.onerror = fire;
    }
  };
  setup(frame);
}

/**
 * Prints a payment proof. A picture (receipt / transfer slip photo) is printed on one page under the payment details;
 * a PDF is printed as it is.
 */
export async function printPaymentProof(proofId: string, d: ProofPrintDetails): Promise<{ ok: boolean; error?: string }> {
  const r = await getPaymentProofUrl(proofId);
  if (!r.ok || !r.url) return { ok: false, error: r.error ?? "Could not open the proof file." };
  let blob: Blob;
  try {
    const res = await fetch(r.url);
    if (!res.ok) throw new Error();
    blob = await res.blob();
  } catch {
    // could not download it here: open it so it can be printed from the browser
    window.open(r.url, "_blank", "noopener");
    return { ok: true };
  }
  const fileUrl = URL.createObjectURL(blob);
  const type = blob.type || "";
  const isPdf = type.includes("pdf") || /\.pdf(\?|$)/i.test(r.url);

  if (isPdf) {
    printInFrame((f) => (f.src = fileUrl), false);
    return { ok: true };
  }
  if (!type.startsWith("image/")) {
    window.open(fileUrl, "_blank", "noopener");
    return { ok: true };
  }

  const rows: [string, string | null | undefined][] = [
    ["Invoice No.", d.invoiceNumber],
    ["Company", d.company],
    ["Customer", d.customer],
    ["Payment date", d.paidDate],
    ["Method", d.method],
    ["Amount", d.amount],
    ["Reference", d.reference],
    ["Sent by", d.sentBy],
    ["Status", d.status],
    ["Remarks", d.remarks],
  ];
  const table = rows
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(String(v))}</td></tr>`)
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payment proof ${esc(d.invoiceNumber)}</title>
<style>
@page{size:A4;margin:12mm}
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}
h1{font-size:16px;margin:0 0 8px}
table{border-collapse:collapse;font-size:12px;margin-bottom:10px}
th{text-align:left;padding:2px 14px 2px 0;color:#555;font-weight:600;vertical-align:top;white-space:nowrap}
td{padding:2px 0;white-space:pre-line}
img{display:block;max-width:100%;max-height:205mm;margin:0 auto;object-fit:contain}
</style></head><body><h1>Payment proof</h1><table>${table}</table><img src="${fileUrl}" alt="Payment proof"></body></html>`;
  printInFrame((f) => (f.srcdoc = html), true);
  return { ok: true };
}
