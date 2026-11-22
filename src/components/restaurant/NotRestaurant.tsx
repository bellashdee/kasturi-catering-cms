import { EmptyRow } from "@/components/dashboard/SectionCard";

/** Shown when a restaurant page is opened while O2 Life is not the only company viewed. */
export function NotRestaurant() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[22px] font-extrabold text-text">Restaurant</h1>
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <EmptyRow text="The restaurant pages are for O2 Life only. Choose O2 Life in the company list at the top of the side menu." />
      </div>
    </div>
  );
}
