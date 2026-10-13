import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusLabel } from "@/components/terminal/StatusLabel";
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
  const batch = result.data;
  const clearedAt = batch?.clearedAtTimestamp ? new Date(batch.clearedAtTimestamp) : null;

  const facts = [
    { name: "Clearing price", value: batch?.clearingPrice },
    { name: "Matched volume", value: batch?.volume },
    { name: "Orders", value: batch?.orderCount?.toString() },
    { name: "Clearing gas", value: batch?.clearGas },
    { name: "Block", value: batch?.blockNumber },
    { name: "Cleared", value: clearedAt && !Number.isNaN(clearedAt.getTime()) ? `${clearedAt.toISOString().slice(0, 19).replace("T", " ")} UTC` : null },
  ];

  return (
    <main className="app-shell">
      <TopBar />
      <div id="content" className="page-content proof-page">
        <section className="panel proof-hero">
          <h1>Batch receipt</h1>
          <p className="batch-headline">Batch #{id}</p>
          <p className="proof-caveat">
            {batch
              ? "Every filled order in this batch settled at the single clearing price below."
              : (result.message ?? "This batch's result is unavailable.")}
          </p>
          <StatusLabel status={result.status} />
        </section>

        <div className="proof-columns">
          <section className="panel">
            <div className="panel-heading"><h2>Result</h2></div>
            <dl className="proof-facts">
              {facts.map((fact) => (
                <div key={fact.name}><dt>{fact.name}</dt><dd>{fact.value ?? "—"}</dd></div>
              ))}
            </dl>
          </section>
          <section className="panel">
            <div className="panel-heading"><h2>Orders in this batch</h2></div>
            <p className="proof-empty">Order-level fills need an indexed order source, which is not connected.</p>
          </section>
        </div>

        <footer className="footer">
          <span><Link href="/">Back to the terminal</Link></span>
          <span>No batch data is shown unless it comes from a verified source.</span>
        </footer>
      </div>
    </main>
  );
}
