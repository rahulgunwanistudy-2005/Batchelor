import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveBatchResult } from "@/components/terminal/LiveBatchResult";
import { TopBar } from "@/components/terminal/TopBar";
import { marketDataAdapter } from "@/lib/market-data/adapter";

interface BatchPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: BatchPageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Batch ${id} — Batchelor` };
}

export default async function BatchPage({ params }: BatchPageProps) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) notFound();

  const result = await marketDataAdapter.getBatchResult("default", id);

  return (
    <main className="app-shell">
      <TopBar />
      <div id="content" className="page-content proof-page">
        <LiveBatchResult key={id} batchId={id} initial={result} />

        <footer className="footer">
          <span><Link href="/">Back to the terminal</Link></span>
          <span>No batch data is shown unless it comes from a verified source.</span>
        </footer>
      </div>
    </main>
  );
}
