"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSpreadsheetImport } from "@/lib/importFlow/useSpreadsheetImport";
import type { FieldDef } from "@/lib/importFlow/types";
import { ColumnMappingStep } from "@/components/shared/import/ColumnMappingStep";
import { ImportSummaryBar, FormError } from "@/components/shared/import/ImportFlowAtoms";
import { bulkImportIngredients } from "@/lib/kitchen/actions";

type Company = { id: string; name: string };

const FIELDS: FieldDef[] = [
  { key: "name", label: "Name", required: true },
  { key: "unitOfMeasure", label: "Unit of Measure" },
  { key: "currentStockQty", label: "Current Stock", type: "number" },
  { key: "reorderLevel", label: "Reorder Level", type: "number" },
  { key: "unitCost", label: "Unit Cost", type: "number" },
];

const HEADER_ALIASES: Record<string, string> = {
  ingredient: "name",
  "ingredient name": "name",
  unit: "unitOfMeasure",
  "current stock": "currentStockQty",
  stock: "currentStockQty",
  "reorder level": "reorderLevel",
  cost: "unitCost",
};

const cellClass = "w-full rounded border border-border-strong px-2 py-1 text-[12.5px] outline-none focus:border-primary";

export function ImportIngredientsFlow({ companies, defaultCompanyId }: { companies: Company[]; defaultCompanyId?: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [result, setResult] = useState<number | null>(null);
  const flow = useSpreadsheetImport(FIELDS, HEADER_ALIASES);

  async function handleConfirm() {
    const outcome = await flow.confirmImport(async (rows) => {
      const { inserted } = await bulkImportIngredients(
        companyId,
        rows.map((r) => ({
          name: r.name,
          unitOfMeasure: r.unitOfMeasure,
          currentStockQty: r.currentStockQty,
          reorderLevel: r.reorderLevel,
          unitCost: r.unitCost,
        })),
      );
      return inserted;
    });
    if (outcome !== null) {
      setResult(outcome);
      router.refresh();
    }
  }

  if (result !== null) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success-bg">
          <svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10l4 4 8-8" />
          </svg>
        </div>
        <div className="text-lg font-bold text-text">{result} ingredient{result === 1 ? "" : "s"} imported</div>
        <button onClick={() => router.push("/kitchen/ingredients")} className="mt-2 rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white">
          Back to Ingredients
        </button>
      </div>
    );
  }

  if (flow.step === "pick") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Company *</label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1.5 h-10 w-full max-w-xs rounded-lg border border-border-strong px-3 text-sm outline-none">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <FormError error={flow.error} />
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-alt py-14 text-center">
          <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="14" height="14" rx="1.5" />
            <line x1="3" y1="8" x2="17" y2="8" />
            <line x1="3" y1="13" x2="17" y2="13" />
            <line x1="9" y1="3" x2="9" y2="17" />
          </svg>
          <span className="text-[14px] font-bold text-text">Click to choose an Excel or CSV file</span>
          <span className="text-[12.5px] text-text-muted">You&apos;ll match its columns to Name, Unit, Stock, Reorder Level and Cost next</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && flow.handleFile(e.target.files[0])} />
        </label>
      </div>
    );
  }

  if (flow.step === "map") {
    return (
      <ColumnMappingStep
        fileName={flow.fileName}
        headers={flow.headers}
        mapping={flow.mapping}
        fields={FIELDS}
        onMappingChange={flow.setColumnMapping}
        onConfirm={flow.confirmMapping}
        onCancel={flow.reset}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ImportSummaryBar fileName={flow.fileName} rowCount={flow.rows.length} invalidCount={flow.invalidCount} onChooseDifferentFile={flow.reset} />
      <FormError error={flow.error} />

      <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-surface-alt">
            <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Current Stock</th>
              <th className="px-3 py-2">Reorder Level</th>
              <th className="px-3 py-2">Unit Cost</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {flow.rows.map((row, i) => (
              <tr key={i} className={`border-t border-border ${flow.rowErrors[i].length > 0 ? "bg-danger-bg/40" : ""}`}>
                <td className="px-3 py-1.5">
                  <input className={cellClass} value={row.name ?? ""} onChange={(e) => flow.updateCell(i, "name", e.target.value)} />
                  {flow.rowErrors[i].length > 0 && <div className="mt-0.5 text-[11px] text-danger">{flow.rowErrors[i].join("; ")}</div>}
                </td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.unitOfMeasure ?? ""} onChange={(e) => flow.updateCell(i, "unitOfMeasure", e.target.value)} /></td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.currentStockQty ?? ""} onChange={(e) => flow.updateCell(i, "currentStockQty", e.target.value)} /></td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.reorderLevel ?? ""} onChange={(e) => flow.updateCell(i, "reorderLevel", e.target.value)} /></td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.unitCost ?? ""} onChange={(e) => flow.updateCell(i, "unitCost", e.target.value)} /></td>
                <td className="px-3 py-1.5"><button onClick={() => flow.removeRow(i)} className="text-xs font-semibold text-danger">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2.5">
        <button onClick={flow.reset} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button onClick={handleConfirm} disabled={flow.saving || flow.validRowCount === 0} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {flow.saving ? "Importing..." : `Confirm & Import ${flow.validRowCount} Ingredient${flow.validRowCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
