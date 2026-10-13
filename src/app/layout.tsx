import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import "./globals.css";

// Downloaded at build time and served from this origin; no runtime request to Google.
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Batchelor — Batch Auction Trading",
  description: "A transparent batch-auction trading interface built for Monad.",
};

export const viewport: Viewport = { themeColor: "#0b0e11", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
