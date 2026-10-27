import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getEmployee } from "@/lib/hr/queries";
import { getHrAccess } from "@/lib/hr/access";
import { EmployeeProfileView } from "@/components/hr/EmployeeProfileView";

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";

  const supabase = await createClient();

  let employee;
  try {
    employee = await getEmployee(supabase, id);
  } catch {
    notFound();
  }

  const access = await getHrAccess(supabase, session, [employee.company_id]);
  // other staff's details are for the company admins only
  if (!access.canSee(employee)) notFound();

  return <EmployeeProfileView employee={employee} access={access} session={session} supabase={supabase} query={query} backHref={`/hr${query}`} />;
}
