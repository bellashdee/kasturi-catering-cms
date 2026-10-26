"use client";

import type { FieldDef } from "@/lib/importFlow/types";
import { Select } from "@/components/ui/Select";

/**
 * The Field Mapping step for Excel/CSV imports: every column the file actually
 * has gets shown next to a dropdown of the fields this import accepts, already
 * pre-guessed from the header text. Nothing is imported until the user confirms
 * this mapping — so a misnamed column can never silently land in the wrong field.
 */
export function ColumnMappingStep({
  fileName,
  headers,
  mapping,
  fields,
  onMappingChange,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  headers: string[];
  mapping: Record<string, string>;
  fields: FieldDef[];
  onMappingChange: (header: string, targetKey: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const mappedKeys = new Set(Object.values(mapping).filter(Boolean));
  const missingRequired = fields.filter((f) => f.required && !mappedKeys.has(f.key));

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[13px] text-text-secondary">
        <b>{fileName}</b> — match each column from your file to a field below.
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface-alt">
            <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2">Column in Your File</th>
              <th className="px-3 py-2">Maps To</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((h) => (
              <tr key={h} className="border-t border-border">
                <td className="px-3 py-2 text-[13px] font-semibold text-text">{h}</td>
                <td className="px-3 py-2">
                  <Select
                    value={mapping[h] ?? ""}
                    onChange={(e) => onMappingChange(h, e.target.value)}
                    className="h-9 w-full max-w-xs rounded-lg border border-border-strong px-2 text-[13px]"
                  >
                    <option value="">Ignore this column</option>
                    {fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}{f.required ? " *" : ""}
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {missingRequired.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning">
          Not mapped yet: {missingRequired.map((f) => f.label).join(", ")} — you can still continue and fill these in manually per row.
        </div>
      )}

      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button onClick={onConfirm} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white">
          Continue to Preview
        </button>
      </div>
    </div>
  );
}
