"use client";

import { useState } from "react";
import { LeaveRequestForm } from "@/components/hr/LeaveRequestForm";
import { SearchSelect } from "@/components/ui/SearchSelect";

type StaffOption = { id: string; companyId: string; label: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";

/** Pick the staff member (by name and company), then the usual leave form appears for that person. */
export function LeaveKeyIn({ staff, canApprove }: { staff: StaffOption[]; canApprove: boolean }) {
  const [label, setLabel] = useState("");
  const chosen = staff.find((s) => s.label === label) ?? null;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="text-[12.5px] font-semibold text-text-secondary">Staff member *</label>
        <SearchSelect value={label} onChange={setLabel} options={staff.map((s) => s.label)} className={inputClass} placeholder="Search the name" />
      </div>
      {chosen ? (
        <LeaveRequestForm key={chosen.id} employeeId={chosen.id} companyId={chosen.companyId} keyIn canApprove={canApprove} />
      ) : (
        <p className="text-[13px] text-text-muted">Choose a staff member to continue.</p>
      )}
    </div>
  );
}
