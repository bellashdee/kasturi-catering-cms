import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getServerLanguage } from "@/lib/i18n/server";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Central Management System",
  description:
    "Central Management System for Signature Solution, Kasturi Indah and O2 Life.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const lang = await getServerLanguage();
  return (
    <html lang={lang} data-i18n={lang === "en" ? "ready" : "pending"} className={`${manrope.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-bg text-text font-sans">
        <I18nProvider initialLanguage={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
