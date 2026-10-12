import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Batchelor — Batch Auction Trading",
  description: "A transparent batch-auction trading interface built for Monad.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
