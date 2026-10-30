import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

/**
 * Self-service signup is disabled: this is an internal-use system. Accounts are created by a Super Admin from
 * Settings → Team Members, so this page tells the person what to do instead of asking for details.
 */
export default function SignupPage() {
  return (
    <AuthShell>
      <h1 className="text-[28px] font-extrabold leading-tight text-text">Create account</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
        Accounts are made by the Administrator, so there is nothing to fill in here. Send Madam Penny or Nabilah your full name and the short name you
        want to use. They will give you your username and password.
      </p>
      <div className="mt-5 flex flex-col gap-2.5 rounded-2xl bg-[#eef3ea] px-4 py-3.5 text-[13.5px] text-[#3f5636]">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold">1</span>
          <span>Tell the Administrator your full name and short name.</span>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold">2</span>
          <span>Receive your username and password.</span>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold">3</span>
          <span>Log in with your email or username, then your password.</span>
        </div>
      </div>
      <Link href="/login" className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#a85d6b] to-[#cf8a94] text-[16px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(168,93,107,0.7)] hover:opacity-95">
        Back to Log In
      </Link>
      <p className="mt-auto pt-8 text-center text-[14px] text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-[#5f7a55] hover:underline">
          Log In
        </Link>
      </p>
    </AuthShell>
  );
}
