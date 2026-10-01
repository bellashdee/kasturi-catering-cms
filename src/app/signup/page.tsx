import { redirect } from "next/navigation";

/**
 * Self-service signup is disabled — this is an internal-use system. Accounts
 * are created by a Super Admin from Settings → Team Members instead.
 */
export default function SignupPage() {
  redirect("/login");
}
