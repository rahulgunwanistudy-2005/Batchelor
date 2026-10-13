import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/terminal/TopBar";
import { marketDataAdapter } from "@/lib/market-data/adapter";

interface BatchPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: BatchPageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Batch ${id} — Batchelor` };
}

const gasFormat = new Intl.NumberFormat("en-US");

export default async function BatchPage({ params }: BatchPageProps) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) notFound();

  const [result, latest] = await Promise.all([
    marketDataAdapter.getBatchResult("default", id),
    marketDataAdapter.getRecentBatches("default", 1),
  ]);
  const latestId = latest.data?.[0]?.batchId ?? null;
  const batch = result.data;
  const clearedAt = batch?.clearedAtTimestamp ? new Date(batch.clearedAtTimestamp) : null;
  const previous = BigInt(id) > BigInt(1) ? (BigInt(id) - BigInt(1)).toString() : null;
  // Only link forward to a batch that has a receipt.
  const next = latestId !== null && BigInt(id) < BigInt(latestId) ? (BigInt(id) + BigInt(1)).toString() : null;

  return (
    <main className="app-shell">
      <TopBar />
      <div id="content" className="page-content page-content--narrow">
        <header className="page-heading">
          <p className="page-kicker">Batch #{id} · receipt</p>
          {batch ? (
            <>
              <h1>
                {batch.clearingPrice ? <>One price for every order: <em>{batch.clearingPrice}</em></> : "This batch cleared without a trade"}
              </h1>
              <p className="page-lede">
                {batch.clearingPrice
                  ? `${batch.volume} changed hands. Every filled order in the batch settled at this single clearing price, whatever its position in the block.`
                  : "Its buy and sell orders did not cross, so every order got its full escrow back."}
              </p>
            </>
          ) : (
            <>
              <h1>{result.status === "unavailable" ? "No receipt yet" : "Receipt unavailable"}</h1>
              <p className="page-lede">{result.message ?? "This batch's result is unavailable."}</p>
            </>
          )}
          <div className="page-actions">
            {previous && <Link className="connect-button" href={`/b/${previous}`}>Previous batch</Link>}
            {next && <Link className="connect-button" href={`/b/${next}`}>Next batch</Link>}
            <Link className="connect-button" href="/history">All batches</Link>
          </div>
        </header>

        {batch && (
          <section className="panel" aria-labelledby="facts-title">
            <div className="panel-heading"><h2 id="facts-title">Batch facts</h2></div>
            <dl className="proof-facts">
              <div><dt>Clearing price</dt><dd>{batch.clearingPrice ?? "No trade"}</dd></div>
              <div><dt>Matched volume</dt><dd>{batch.volume ?? "—"}</dd></div>
              <div><dt>Clearing gas</dt><dd>{batch.clearGas ? gasFormat.format(Number(batch.clearGas)) : "—"}</dd></div>
              <div><dt>Clearing block</dt><dd>{batch.blockNumber ?? "—"}</dd></div>
              <div><dt>Cleared at</dt><dd>{clearedAt && !Number.isNaN(clearedAt.getTime()) ? `${clearedAt.toISOString().slice(0, 19).replace("T", " ")} UTC` : "—"}</dd></div>
            </dl>
            <p className="panel-footnote">
              Clearing gas is what the contract spent matching this batch, before the event and transaction overhead. Read from the auction contract.
            </p>
          </section>
        )}

        <footer className="footer">
          <span>Read directly from the auction contract.</span>
          <span>Demo tokens on Monad testnet. No real value.</span>
        </footer>
      </div>
    </main>
  );
}
