export const metadata = { title: "Privacy Policy" };

/** Public privacy policy (needed by Google for the "Choose from Google Drive" sign-in). Open to anyone, no login. */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-[14px] leading-relaxed text-text">
      <h1 className="text-[22px] font-extrabold">Privacy Policy</h1>
      <p className="mt-1 text-[13px] text-text-secondary">Central Management System of Kasturi Indah Sdn Bhd, Signature Solution Sdn Bhd and O2 Life · Last updated 13 November 2026</p>

      <h2 className="mt-6 text-[16px] font-bold">Who uses this system</h2>
      <p className="mt-1">This system is used only by the staff of the companies above, to run catering, kitchen, purchasing, finance and HR work. It is not a public service.</p>

      <h2 className="mt-6 text-[16px] font-bold">Google Drive</h2>
      <p className="mt-1">
        Staff can attach a file (for example a supplier invoice or a receipt) by choosing it from their own Google Drive. Each person signs in with their own Google
        account. The system asks only for the files the person chooses (Google&apos;s &quot;drive.file&quot; permission): it cannot see, change or delete any other file
        in their Drive. The chosen file is copied into the system as an attachment. The Google sign-in is not kept: it is asked again the next time.
      </p>

      <h2 className="mt-6 text-[16px] font-bold">What is kept and who sees it</h2>
      <p className="mt-1">
        The information keyed in or attached (events, customers, invoices, receipts, staff records) is kept in the companies&apos; own database and file storage. Each
        person only sees what their role and company allow. Nothing is sold or shared with anyone outside the companies.
      </p>

      <h2 className="mt-6 text-[16px] font-bold">Contact</h2>
      <p className="mt-1">For any question about your data, contact the company office (Kasturi Indah Sdn Bhd, Johor Bahru).</p>
    </div>
  );
}
