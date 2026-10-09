"use client";

import { useState } from "react";
import { uploadDocument, fileTypeFromMime, type DocumentFileType } from "@/lib/documents/upload";
import type { DuplicateMatch } from "@/lib/importFlow/types";
import { requestExtraction } from "@/lib/importFlow/extractClient";
import type { ExtractionReport } from "@/lib/extraction/types";

export type ImportTab = "manual" | "pdf" | "photo";

/**
 * The reusable engine behind every "Upload → Document Detection → Extraction/OCR
 * → Review → Validation → Duplicate Check → Confirmation → Save → Attach" flow
 * in the system. It owns the upload/OCR mechanics and the confirm/duplicate-check
 * choreography; it knows nothing about what fields a particular module collects —
 * each module renders its own review form and hands this hook plain callbacks.
 *
 * A module adopts this by composing it with the presentational atoms in
 * `@/components/shared/import` instead of re-implementing tab state, upload
 * wiring, and the extraction-notice/error/duplicate banners from scratch.
 */
export function useDocumentUpload() {
  const [tab, setTabState] = useState<ImportTab>("manual");
  const [step, setStep] = useState<"pick" | "review">("review");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [report, setReport] = useState<ExtractionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [duplicatesChecked, setDuplicatesChecked] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  function selectTab(next: ImportTab) {
    setTabState(next);
    setFile(null);
    setDocumentId(null);
    setNotice(null);
    setReport(null);
    setError(null);
    setDuplicates(null);
    setDuplicatesChecked(false);
    setStep(next === "manual" ? "review" : "pick");
  }

  /** Call this whenever a field the duplicate check depends on changes. */
  function resetDuplicateState() {
    setDuplicates(null);
    setDuplicatesChecked(false);
  }

  /**
   * Upload → Document Detection (the tab already tells us pdf vs photo/screenshot)
   * → Extraction/OCR. Returns the raw extracted JSON for the caller to map onto
   * its own field state (Field Mapping is deliberately left to the caller, since
   * every module's AI response shape is different).
   */
  async function uploadAndExtract(params: {
    companyId: string;
    module: string;
    extractionKind: string;
  }): Promise<unknown | null> {
    if (!file) return null;
    setUploading(true);
    setError(null);
    setReport(null);
    try {
      const fileType: DocumentFileType = fileTypeFromMime(file);
      const doc = await uploadDocument({ companyId: params.companyId, module: params.module, fileType, file });
      setDocumentId(doc.id);

      // A failure with no explanation from the server (platform timeout, dropped connection) is retried once; explained failures are not.
      let { res, result } = await requestExtraction(doc.id, params.extractionKind);
      if (!res.ok && (result.code === "network" || result.code?.startsWith("http_5"))) {
        await new Promise((r) => setTimeout(r, 3000));
        ({ res, result } = await requestExtraction(doc.id, params.extractionKind));
      }

      if (!res.ok) {
        setNotice(`Could not read the file: ${result.error ?? "the server did not give a reason"} The file is saved — fill in the fields manually, or choose the file again to retry.`);
        setStep("review");
        return null;
      }
      if (result.configured === false) {
        setNotice(result.message);
        setStep("review");
        return null;
      }
      setReport(result.report ?? null);
      const values = result.extracted && typeof result.extracted === "object" ? Object.values(result.extracted as Record<string, unknown>) : [];
      const nothingRead = values.every((v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0));
      if (nothingRead) {
        setNotice(result.report?.valuesWithheld ? "This file is too blurry to trust, so nothing was filled in. The suggestions below are only a guide — type the correct values from the original, or upload a clearer copy." : "The AI could not read any details from this file (it may be blurry, cut off or the wrong document type). The file is saved — fill in the fields manually, or try a clearer copy.");
        setStep("review");
        return null;
      }
      console.debug("[extract] preview ready", { fields: Object.keys(result.extracted ?? {}).length, needsReview: result.report?.needsReview ?? null });
      setNotice("This information was extracted automatically. Please check every field before saving.");
      setStep("review");
      return result.extracted ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      return null;
    } finally {
      setUploading(false);
    }
  }

  /** Duplicate Check step — pluggable per module, since only some data is checkable this way. */
  async function runDuplicateCheck(checkFn: () => Promise<DuplicateMatch[]>) {
    setCheckingDuplicates(true);
    setError(null);
    try {
      const matches = await checkFn();
      setDuplicates(matches);
      setDuplicatesChecked(true);
      return matches;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check for duplicates.");
      return [];
    } finally {
      setCheckingDuplicates(false);
    }
  }

  const hasDuplicates = duplicatesChecked && !!duplicates && duplicates.length > 0;

  /** User Confirmation → Database Save (+ Attach Original Document, handled by the caller passing documentId through). */
  async function confirm(saveFn: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await saveFn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
      throw err;
    }
  }

  return {
    tab,
    step,
    file,
    uploading,
    documentId,
    notice,
    report,
    error,
    saving,
    duplicates,
    duplicatesChecked,
    checkingDuplicates,
    hasDuplicates,
    setFile,
    setNotice,
    setError,
    setStep,
    selectTab,
    resetDuplicateState,
    uploadAndExtract,
    runDuplicateCheck,
    confirm,
  };
}
