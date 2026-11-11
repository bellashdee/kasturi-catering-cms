"use client";

import { useState } from "react";

/**
 * "Choose from Google Drive": the staff member signs in with their OWN Google account (Google's account chooser), picks a file
 * from their own Drive, and the file is handed to the page exactly as if it had been chosen from the computer.
 * Only the file picked is shared with the system (scope drive.file); nothing else in their Drive can be read.
 * Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_API_KEY and NEXT_PUBLIC_GOOGLE_APP_ID (the Google Cloud project number).
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
const APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXTENSION_MIME: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".xlsx": [XLSX, GOOGLE_SHEET],
  ".xls": ["application/vnd.ms-excel"],
  ".csv": ["text/csv"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".doc": ["application/msword"],
  ".txt": ["text/plain"],
};
const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];

/** The file types the page accepts, as Google Drive file types (an empty list shows every file). */
function mimeTypesFor(accept: string): string[] {
  const out = new Set<string>();
  for (const raw of accept.split(",")) {
    const t = raw.trim().toLowerCase();
    if (t === "image/*") IMAGE_MIME.forEach((m) => out.add(m));
    else if (t.startsWith(".")) (EXTENSION_MIME[t] ?? []).forEach((m) => out.add(m));
    else if (t.includes("/")) out.add(t);
  }
  return Array.from(out);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type GoogleWindow = Window & { gapi?: any; google?: any };

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          scripts.delete(src);
          reject(new Error("Could not reach Google. Check the internet connection and try again."));
        };
        document.head.appendChild(s);
      }),
    );
  }
  return scripts.get(src)!;
}

async function loadGoogle(): Promise<any> {
  await Promise.all([loadScript("https://apis.google.com/js/api.js"), loadScript("https://accounts.google.com/gsi/client")]);
  const w = window as GoogleWindow;
  await new Promise<void>((resolve) => w.gapi.load("picker", { callback: () => resolve() }));
  return w.google;
}

// no token is kept between files: on a shared office computer the next person must never open the previous person's Drive
function signIn(google: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (res: { access_token?: string; error?: string }) => {
        if (res.error || !res.access_token) return reject(new Error("Google sign-in was not completed."));
        resolve(res.access_token);
      },
      error_callback: () => reject(new Error("Google sign-in was closed before it finished.")),
    });
    // always show the account chooser, so each staff member picks their own Google account
    client.requestAccessToken({ prompt: "select_account" });
  });
}

function pick(google: any, token: string, mimeTypes: string[]): Promise<{ id: string; name: string; mimeType: string } | null> {
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false);
    if (mimeTypes.length > 0) view.setMimeTypes(mimeTypes.join(","));
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setTitle("Choose a file from your Google Drive")
      .setCallback((data: any) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.PICKED) {
          const doc = data[google.picker.Response.DOCUMENTS][0];
          resolve({ id: doc[google.picker.Document.ID], name: doc[google.picker.Document.NAME], mimeType: doc[google.picker.Document.MIME_TYPE] });
        } else if (action === google.picker.Action.CANCEL) resolve(null);
      })
      .build();
    picker.setVisible(true);
  });
}

async function download(token: string, f: { id: string; name: string; mimeType: string }): Promise<File> {
  const isSheet = f.mimeType === GOOGLE_SHEET;
  const url = isSheet
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}/export?mimeType=${encodeURIComponent(XLSX)}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not download the file from Google Drive.");
  const blob = await res.blob();
  return new File([blob], isSheet ? `${f.name}.xlsx` : f.name, { type: isSheet ? XLSX : f.mimeType || blob.type });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function GoogleDrivePickButton({ accept, onPick, className }: { accept: string; onPick: (file: File) => void; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = CLIENT_ID !== "" && API_KEY !== "" && APP_ID !== "";

  async function choose() {
    setError(null);
    if (!configured) {
      setError("Google Drive is not set up for this system yet. Ask the administrator.");
      return;
    }
    setBusy(true);
    try {
      const google = await loadGoogle();
      const token = await signIn(google);
      const picked = await pick(google, token, mimeTypesFor(accept));
      if (picked) onPick(await download(token, picked));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open Google Drive.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={choose}
        disabled={busy}
        className={className ?? "inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text disabled:opacity-60"}
      >
        <svg width="16" height="16" viewBox="0 0 87.3 78" aria-hidden="true">
          <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
          <path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9.06 9.06 0 000 53h27.5z" fill="#00ac47" />
          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#ea4335" />
          <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
          <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
          <path d="M73.4 26.5L60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
        </svg>
        {busy ? "Opening Google Drive..." : "Choose from Google Drive"}
      </button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </span>
  );
}
