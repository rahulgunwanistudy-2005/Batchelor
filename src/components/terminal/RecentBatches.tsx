import Link from "next/link";
import type { BatchResult, MarketDataResult } from "@/types/market";

function clearedAt(timestamp: number | null): string {
  if (timestamp === null) return "—";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "—" : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const gasFormat = new Intl.NumberFormat("en-US");

interface RecentBatchesProps {
  result: MarketDataResult<BatchResult[]>;
  title: string;
  subtitle: string;
  /** Show only the first few rows, with a link to the full history page. */
  preview?: number;
}

/** Cleared batches, newest first; each row opens that batch's receipt. */
export function RecentBatches({ result, title, subtitle, preview }: RecentBatchesProps) {
  const all = result.data ?? [];
  const batches = preview ? all.slice(0, preview) : all;

  return (
    <section className="panel" aria-labelledby="batches-title">
      <div className="panel-heading">
        <div>
          <h2 id="batches-title">{title}</h2>
          <p className="panel-subtitle">{subtitle}</p>
        </div>
        {preview && all.length > 0 && <Link className="panel-link" href="/history">All batches</Link>}
      </div>
      {batches.length > 0 ? (
        <div className="table-scroll" style={{ marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Batch</th>
                <th scope="col" className="num">Clearing price</th>
                <th scope="col" className="num">Volume</th>
                <th scope="col" className="num">Clearing gas</th>
                <th scope="col">Block</th>
                <th scope="col">Cleared</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.batchId}>
                  <th scope="row"><Link href={`/b/${batch.batchId}`}>#{batch.batchId}</Link></th>
                  <td className="num">{batch.clearingPrice ?? "No trade"}</td>
                  <td className="num">{batch.volume ?? "—"}</td>
                  <td className="num">{batch.clearGas ? gasFormat.format(Number(batch.clearGas)) : "—"}</td>
                  <td>{batch.blockNumber ?? "—"}</td>
                  <td>{clearedAt(batch.clearedAtTimestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="table-empty">
          {result.status === "live" ? "No batch has been cleared on this market yet." : (result.message ?? "Batch history is unavailable.")}
        </p>
      )}
    </section>
  );
}
