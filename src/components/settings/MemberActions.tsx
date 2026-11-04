"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateMember, deleteMember } from "@/lib/users/actions";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { ROLE_LABEL } from "@/lib/users/constants";
import { ModulePicker } from "@/components/settings/ModulePicker";
import { CompanyPicker } from "@/components/settings/CompanyPicker";
import type { Database } from "@/lib/supabase/types";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };
type UserRole = Database["public"]["Enums"]["user_role"];

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px] outline-none";
const labelClass = "text-[11px] font-semibold text-text-secondary";

export function MemberActions({
  userId,
  companies,
  initial,
}: {
  userId: string;
  companies: Company[];
  initial: { fullName: string; username: string; email: string; role: UserRole; allCompanies: boolean; companyIds: string[]; allowedModules: string[] | null; canViewMainDashboard: boolean };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(initial.fullName);
  const [username, setUsername] = useState(initial.username);
  const [email, setEmail] = useState(initial.email);
  const [role, setRole] = useState<UserRole>(initial.role);
  const [allCompanies, setAllCompanies] = useState(initial.allCompanies);
  const [companyIds, setCompanyIds] = useState<string[]>(initial.companyIds);
  const [modules, setModules] = useState<string[] | null>(initial.allowedModules);
  const [dashboard, setDashboard] = useState(initial.canViewMainDashboard);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (modules !== null && modules.length === 0) {
      setError("Select at least one module, or choose All modules.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await updateMember(userId, {
        fullName,
        username,
        email: email.trim() !== initial.email ? email.trim() : undefined,
        role,
        allCompanies,
        companyIds,
        allowedModules: modules,
        canViewMainDashboard: role === "super_admin" || dashboard,
        newPassword: newPassword || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      setNewPassword("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteMember(userId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
      setDeleting(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-end gap-2">
        {error && <span className="text-xs text-danger">{error}</span>}
        <button onClick={() => setEditing(true)} className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-bold text-text">
          Edit
        </button>
        {confirmDelete ? (
          <>
            <button disabled={deleting} onClick={handleDelete} className="rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
              {deleting ? "Deleting..." : "Confirm Delete"}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-bold text-text">
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger">
            Delete
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="col-span-5 mt-2 rounded-lg border border-border-strong bg-surface-alt p-3">
      {error && <div className="mb-2 rounded-lg border border-danger/30 bg-danger-bg px-2 py-1.5 text-xs text-danger">{error}</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={labelClass}>Full Name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Email (for sign-in)</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoCapitalize="none" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Role</label>
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputClass}>
            {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
      </div>
      <div className="mt-2">
        <CompanyPicker
          companies={companies}
          allCompanies={allCompanies}
          companyIds={companyIds}
          forceAll={role === "super_admin"}
          onChange={(next) => {
            setAllCompanies(next.allCompanies);
            setCompanyIds(next.companyIds);
          }}
        />
      </div>
      <ModulePicker value={modules} onChange={setModules} />
      <label className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px] text-text">
        <input type="checkbox" checked={role === "super_admin" || dashboard} disabled={role === "super_admin"} onChange={(e) => setDashboard(e.target.checked)} />
        Can view the Main Dashboard (the company figures)
      </label>
      <div className="mt-2">
        <label className={labelClass}>Set New Password (optional)</label>
        <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Leave blank to keep current password" className={inputClass} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={() => setEditing(false)} className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-bold text-text">
          Cancel
        </button>
        <button disabled={saving} onClick={handleSave} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
