import { redirect } from "next/navigation";

/** The old per-employee overtime log (manual hours) is replaced by the OT Form, which calculates the hours itself. */
export default async function LegacyNewOvertimePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/hr/overtime/new?employee=${id}`);
}
