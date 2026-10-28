import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Manrope } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getServerLanguage } from "@/lib/i18n/server";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// the easy-to-read letters (made for readers with low vision), used when the person chooses them in Settings
const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// the text size and the letters chosen in Settings are set before the page is shown, so it never jumps
const DISPLAY_SCRIPT = `try{var d=document.documentElement,s=localStorage.getItem("cms-text-size"),f=localStorage.getItem("cms-easy-font");if(s==="large"||s==="xlarge")d.setAttribute("data-text-size",s);if(f==="on")d.setAttribute("data-easy-font","on")}catch(e){}`;

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
    <html lang={lang} data-i18n={lang === "en" ? "ready" : "pending"} className={`${manrope.variable} ${atkinson.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_SCRIPT }} />
      </head>
      <body className="min-h-full bg-bg text-text font-sans">
        <I18nProvider initialLanguage={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
