"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCostCategory, renameCostCategory, restoreCostCategory } from "@/lib/finance/actions";
import { BTN_SM, BTN_SM_GHOST, FIELD } from "@/components/priority/ui";

/** A cost category with Edit (rename), Delete and Undo; the default categories (for every company) are read only. */
export function CategoryRow({ ids, name, companyName, editable }: { ids: string[]; name: string; companyName: string | null; editable: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<{ id: string; company_id: string; name: string }[] | null>(null);
  const [pending, start] = useTransition();

  function run(task: () => Promise<void>) {
    setError(null);
    start(async () => {
      try {
        await task();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  if (deleted) {
    return (
      <div className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
        <span className="text-text-muted">{`Deleted: ${name}`}</span>
        <span className="flex items-center gap-2">
          {error && <span className="text-[12px] font-semibold text-danger">{error}</span>}
          <button
            type="button"
            className={BTN_SM_GHOST}
            disabled={pending}
            onClick={() =>
              run(async () => {
                for (const row of deleted) await restoreCostCategory(row);
                setDeleted(null);
              })
            }
          >
            Undo
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13.5px]">
      {editing ? (
        <form
          className="flex flex-1 flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              for (const id of ids) await renameCostCategory(id, value);
              setEditing(false);
            });
          }}
        >
          <input autoFocus required className={`${FIELD} max-w-xs`} value={value} onChange={(e) => setValue(e.target.value)} />
          <button type="submit" className={BTN_SM} disabled={pending}>
            Save
          </button>
          <button
            type="button"
            className={BTN_SM_GHOST}
            onClick={() => {
              setEditing(false);
              setValue(name);
              setError(null);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <span className="font-semibold text-text">{name}</span>
      )}
      <span className="flex items-center gap-2">
        {error && <span className="text-[12px] font-semibold text-danger">{error}</span>}
        <span className="text-xs text-text-muted">{companyName ?? "Global default"}</span>
        {editable && !editing && (
          <>
            <button type="button" className={BTN_SM_GHOST} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className={BTN_SM_GHOST}
              disabled={pending}
              onClick={() => window.confirm(`Delete the category "${name}"? Past expenses keep their category name.`) && run(async () => {
                  const rows = [];
                  for (const id of ids) rows.push(await deleteCostCategory(id));
                  setDeleted(rows);
                })}
            >
              Delete
            </button>
          </>
        )}
      </span>
    </div>
  );
}
