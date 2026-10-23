import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans_Arabic, Jost } from "next/font/google";
import "./globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "ميكاسا",
  description: "نظام المخزون والجرد لميكاسا",
};

export const viewport: Viewport = {
  themeColor: "#FAFAF8",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${jost.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
