"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addStaffAssignment } from "@/lib/catering/actions";
import { Select } from "@/components/ui/Select";

type Employee = { id: string; full_name: string };

export function StaffAssignForm({ companyId, eventId, employees }: { companyId: string; eventId: string; employees: Employee[] }) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [role, setRole] = useState("kitchen");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) {
      setError("No employees available for this company yet — add one in HR first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addStaffAssignment({ companyId, eventId, employeeId, role });
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
      <div className="flex-1">
        <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]">
          {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </Select>
      </div>
      <Select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 rounded-lg border border-border-strong px-2 text-[13px]">
        <option value="kitchen">Kitchen</option>
        <option value="service">Service</option>
        <option value="driver">Driver</option>
        <option value="other">Other</option>
      </Select>
      <button type="submit" disabled={saving || !employeeId} className="h-9 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-60">
        {saving ? "Adding..." : "+ Assign"}
      </button>
    </form>
  );
}
