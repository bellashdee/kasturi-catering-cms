import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getServerLanguage } from "@/lib/i18n/server";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// the font and the text size (10 to 25) chosen in Settings are set before the page is shown, so it never jumps; Arial unless another is chosen
const DISPLAY_SCRIPT = `try{var d=document.documentElement,f=localStorage.getItem("cms-font")||"arial",n=parseInt(localStorage.getItem("cms-font-size"),10);if(f!=="standard")d.setAttribute("data-font",f);if(n>=10&&n<=25&&n!==14){d.setAttribute("data-font-size",String(n));d.style.setProperty("--ui-zoom",String(n/14))}}catch(e){}`;

export const metadata: Metadata = {
  title: "Central Management System",
  description:
    "Central Management System for Signature Solution, Kasturi Indah and O2 Life.",
  manifest: "/manifest.webmanifest",
  // the Kasturi Catering logo (?v=2 so phones and browsers drop the old "CM" icon they kept)
  icons: { icon: [{ url: "/favicon.ico?v=2", sizes: "any" }], apple: "/icons/apple-touch-icon.png?v=2" },
  appleWebApp: { capable: true, title: "Kasturi Catering", statusBarStyle: "default" },
};

// Phones: never zoom out to fit a wide page (the page then shrinks to a tiny desktop view): the screen width is the page width.
export const viewport: Viewport = { width: "device-width", initialScale: 1, minimumScale: 1 };

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const lang = await getServerLanguage();
  return (
    <html lang={lang} data-i18n={lang === "en" ? "ready" : "pending"} className={`${manrope.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_SCRIPT }} />
      </head>
      <body className="min-h-full bg-bg text-text font-sans">
        <I18nProvider initialLanguage={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
