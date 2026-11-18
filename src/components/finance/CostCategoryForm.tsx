"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCostCategory } from "@/lib/finance/actions";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };

export function CostCategoryForm({ companies, defaultCompanyId }: { companies: Company[]; defaultCompanyId?: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createCostCategory(companyId, name);
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      {error && <div className="w-full rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      <div>
        <label className="text-[12px] font-semibold text-text-secondary">Company</label>
        <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1 block h-9 w-48 rounded-lg border border-border-strong px-2 text-[13px]">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <div className="flex-1">
        <label className="text-[12px] font-semibold text-text-secondary">New Category Name</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" placeholder="e.g. Software Subscriptions" />
      </div>
      <button type="submit" disabled={saving || !name.trim()} className="h-9 rounded-lg bg-primary px-4 text-xs font-bold text-white disabled:opacity-60">
        {saving ? "Adding..." : "+ Add Category"}
      </button>
    </form>
  );
}
