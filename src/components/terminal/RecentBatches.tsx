import Link from "next/link";
import type { BatchResult, MarketDataResult } from "@/types/market";

function clearedAt(timestamp: number | null): string {
  if (timestamp === null) return "—";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "—" : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Most recent cleared batches; each row opens that batch's receipt. */
export function RecentBatches({ result }: { result: MarketDataResult<BatchResult[]> }) {
  const batches = result.data ?? [];

  return (
    <section className="panel" id="history">
      <div className="panel-heading">
        <div>
          <h2>Auction history</h2>
          <p className="panel-subtitle">Recent cleared batches, newest first</p>
        </div>
      </div>
      {batches.length > 0 ? (
        <div className="gas-table-scroll">
          <table className="gas-table live-table">
            <thead>
              <tr><th scope="col">Batch</th><th scope="col">Clearing price</th><th scope="col">Volume</th><th scope="col">Clearing gas</th><th scope="col">Cleared</th></tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.batchId}>
                  <th scope="row"><Link href={`/b/${batch.batchId}`}>#{batch.batchId}</Link></th>
                  <td>{batch.clearingPrice ?? "No trade"}</td>
                  <td>{batch.volume ?? "—"}</td>
                  <td>{batch.clearGas ?? "—"}</td>
                  <td>{clearedAt(batch.clearedAtTimestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="proof-empty">
          {result.status === "live" ? "No batch has been cleared on this market yet." : (result.message ?? "Batch history is unavailable.")}
        </p>
      )}
    </section>
  );
}
