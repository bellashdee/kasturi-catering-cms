"use client";

type Company = { id: string; name: string };

/** Which companies a member can open: every company, or only the ticked ones. */
export function CompanyPicker({
  companies,
  allCompanies,
  companyIds,
  onChange,
  forceAll,
}: {
  companies: Company[];
  allCompanies: boolean;
  companyIds: string[];
  onChange: (next: { allCompanies: boolean; companyIds: string[] }) => void;
  /** Super Admin always sees every company. */
  forceAll?: boolean;
}) {
  const all = forceAll || allCompanies;
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-[11px] font-semibold text-text-secondary">Companies this member can open</div>
      <div className="mt-1.5 flex gap-4 text-[12.5px] text-text">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={all} onChange={() => onChange({ allCompanies: true, companyIds })} /> All companies
        </label>
        <label className={`flex items-center gap-1.5 ${forceAll ? "opacity-50" : ""}`}>
          <input type="radio" disabled={forceAll} checked={!all} onChange={() => onChange({ allCompanies: false, companyIds })} /> Only selected companies
        </label>
      </div>
      {!all && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {companies.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-[12.5px] text-text">
              <input
                type="checkbox"
                checked={companyIds.includes(c.id)}
                onChange={(e) =>
                  onChange({
                    allCompanies: false,
                    companyIds: e.target.checked ? [...companyIds, c.id] : companyIds.filter((id) => id !== c.id),
                  })
                }
              />
              {c.name}
            </label>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-text-muted">
        {forceAll
          ? "A Super Admin can always open every company."
          : all
            ? "This person can see every company. Only give this to trusted people."
            : "This person can only see the ticked companies. Other companies stay hidden."}
      </p>
    </div>
  );
}
