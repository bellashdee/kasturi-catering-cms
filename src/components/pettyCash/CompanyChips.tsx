"use client";

/** The companies of a petty cash entry as buttons: tick one or more (at least one stays chosen). */
export function CompanyChips({ companies, value, onChange }: { companies: { id: string; name: string }[]; value: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(value.includes(id) ? (value.length > 1 ? value.filter((x) => x !== id) : value) : [...value, id]);
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {companies.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={value.includes(c.id)}
          onClick={() => toggle(c.id)}
          className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${value.includes(c.id) ? "border-primary bg-primary text-white" : "border-border-strong bg-white text-text hover:bg-surface-alt"}`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
