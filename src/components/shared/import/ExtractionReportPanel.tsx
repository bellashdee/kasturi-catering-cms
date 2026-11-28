"use client";

import type { ExtractionReport } from "@/lib/extraction/types";

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "bg-success-bg text-success",
  medium: "bg-warning-bg text-warning",
  low: "bg-danger-bg text-danger",
};

const humanize = (field: string) => field.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * What the reader found, laid out for checking against the original before anything is saved: field, value as printed,
 * source page, confidence and review notes. The values themselves are edited in the form this panel sits above.
 */
export function ExtractionReportPanel({ report }: { report: ExtractionReport | null | undefined }) {
  if (!report) return null;
  const flagged = report.fields.filter((f) => f.needsReview).length;
  const failedChecks = report.validation.filter((c) => !c.ok).length;

  return (
    <details open={report.needsReview} className="rounded-lg border border-border bg-surface">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px] font-bold text-text">
        <span>Review extracted data</span>
        <span className="rounded-full bg-info-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-info">{report.documentTypeLabel}</span>
        {flagged > 0 && <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-warning">{flagged} field{flagged === 1 ? "" : "s"} to check</span>}
        {failedChecks > 0 && <span className="rounded-full bg-danger-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-danger">{failedChecks} figure mismatch{failedChecks === 1 ? "" : "es"}</span>}
      </summary>

      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-[12.5px]">
        <p className="text-text-secondary">
          Read from: {report.inspection.summary}. Nothing is saved until you confirm — correct any value in the form below.
        </p>

        {report.typeWarning && <div className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 font-semibold text-warning">{report.typeWarning}</div>}

        {report.issues.length > 0 && (
          <ul className="list-disc rounded-lg border border-warning/40 bg-warning-bg py-2 pl-7 pr-3 text-warning">
            {report.issues.map((issue, i) => <li key={i}>{issue}</li>)}
          </ul>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-text-muted">
                <th className="py-1.5 pr-3">Field</th>
                <th className="py-1.5 pr-3">Extracted value</th>
                <th className="py-1.5 pr-3">Source</th>
                <th className="py-1.5 pr-3">Confidence</th>
                <th className="py-1.5">Review notes</th>
              </tr>
            </thead>
            <tbody>
              {report.fields.map((f) => (
                <tr key={f.field} className={`border-t border-border align-top ${f.needsReview ? "bg-warning-bg/50" : ""}`}>
                  <td className="py-1.5 pr-3 font-semibold text-text">{humanize(f.field)}</td>
                  <td className={`py-1.5 pr-3 ${f.status === "found" ? "font-semibold text-text" : f.status === "unreadable" ? "font-bold text-danger" : "italic text-text-muted"}`}>{f.display}</td>
                  <td className="py-1.5 pr-3 text-text-secondary">{f.source ?? "—"}</td>
                  <td className="py-1.5 pr-3">
                    {f.confidence ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CONFIDENCE_STYLE[f.confidence]}`}>{f.confidence[0].toUpperCase() + f.confidence.slice(1)}</span> : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="py-1.5 text-text-secondary">
                    {f.label ? <div>Printed label: “{f.label}”</div> : null}
                    {f.notes.map((n, i) => <div key={i}>{n}</div>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {report.tables.map((t) => (
          <div key={t.name}>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">{humanize(t.name)} ({t.rows.length})</div>
            <div className="max-h-64 overflow-auto rounded-lg border border-border">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-surface-alt text-[11px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-2 py-1">Source</th>
                    {t.columns.map((c) => <th key={c} className="px-2 py-1">{humanize(c)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1 text-text-muted">{t.sources[i] ?? "—"}</td>
                      {row.map((cell, j) => <td key={j} className="px-2 py-1 text-text">{cell ?? ""}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {report.validation.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Figure checks (original numbers are never changed)</div>
            <ul className="flex flex-col gap-1">
              {report.validation.map((c, i) => (
                <li key={i} className={c.ok ? "text-success" : "font-semibold text-danger"}>
                  {c.ok ? "✓" : "⚠"} {c.name}: {c.detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.pages.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Pages the reader looked at</div>
            <ul className="text-text-secondary">
              {report.pages.map((p, i) => <li key={i}><b>{p.page}:</b> {p.content}</li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
