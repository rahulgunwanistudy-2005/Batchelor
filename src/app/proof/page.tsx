import type { Metadata } from "next";
import { GasBars } from "@/components/proof/GasBars";
import { LiveBytecodeCheck } from "@/components/proof/LiveBytecodeCheck";
import { TopBar } from "@/components/terminal/TopBar";
import { deployments, liveComparisons, liveEvidence, pendingMeasurements, storageProvenance, storageScenarios } from "@/lib/proof/benchmarks";

export const metadata: Metadata = {
  title: "Proof — Batchelor",
  description: "Measured storage gas on Monad before and after MIP-8, and what has not been measured yet.",
};

const gasFormat = new Intl.NumberFormat("en-US");

export default function ProofPage() {
  const headline = storageScenarios.find((scenario) => scenario.key === "contiguous512");
  const measuredAt = new Date(storageProvenance.measuredAt);

  const pending = [
    {
      name: "Auction clearing gas",
      done: pendingMeasurements.auctionClearingMeasured,
      detail: "Gas to clear a full book under each hardfork. Needs the auction contract's clearing logic.",
    },
    {
      name: "Per-entrypoint gas bounds",
      done: pendingMeasurements.gasBoundsMeasured,
      detail: "Worst-case gas for each contract call, used as explicit gas limits.",
    },
    ...(pendingMeasurements.liveTestnetPassed
      ? []
      : [{ name: "Live testnet measurement", done: false, detail: pendingMeasurements.liveTestnetReason }]),
    {
      name: "Live clearing gas per batch",
      done: false,
      detail: "Emitted by the contract with every cleared batch. Needs a deployment.",
    },
  ];

  return (
    <main className="app-shell">
      <TopBar active="proof" />
      <div id="content" className="page-content proof-page">
        <section className="panel proof-hero">
          <h1>Proof</h1>
          {headline ? (
            <>
              <p className="proof-number">{(headline.before / headline.after).toFixed(2)}×</p>
              <p className="proof-lede">
                less gas to read 512 contiguous storage slots after MIP-8: {gasFormat.format(headline.before)} gas under MonadNine, {gasFormat.format(headline.after)} under MonadTen, on identical bytecode.
              </p>
            </>
          ) : (
            <p className="proof-lede">The storage benchmark file has no usable headline measurement.</p>
          )}
          {liveEvidence.passed && (
            <p className="proof-confirmed">
              <span className="system-dot system-dot--ok" aria-hidden="true" />
              Reproduced on Monad testnet: {liveEvidence.exactMatches} of {liveComparisons.length} probes used exactly the gas measured locally.
            </p>
          )}
          <p className="proof-caveat">
            These are storage-probe measurements, not auction clearing costs. Each figure includes the probe&apos;s own loop, bounds-check and checksum work, and excludes transaction overhead.
          </p>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Storage probes, before and after MIP-8</h2>
              <p className="panel-subtitle">Gas measured in Monad Foundry, same contract under both rule sets</p>
            </div>
          </div>
          {storageScenarios.length > 0 ? (
            <GasBars scenarios={storageScenarios} />
          ) : (
            <p className="proof-empty">No valid storage measurements were found.</p>
          )}
        </section>

        {liveEvidence.passed && liveEvidence.address && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Live testnet validation</h2>
                <p className="panel-subtitle">The same probe contract, deployed and measured on Monad testnet (chain {liveEvidence.chainId})</p>
              </div>
            </div>
            <LiveBytecodeCheck address={liveEvidence.address} chainId={liveEvidence.chainId} expectedSha256={liveEvidence.runtimeBytecodeSha256} />
            <div className="gas-table-scroll">
              <table className="gas-table live-table">
                <caption className="sr-only">Gas used by each probe locally and in a real testnet transaction.</caption>
                <thead>
                  <tr><th scope="col">Probe</th><th scope="col">Local gas</th><th scope="col">Testnet gas</th><th scope="col">Difference</th><th scope="col">Transaction</th></tr>
                </thead>
                <tbody>
                  {liveComparisons.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{row.label}</th>
                      <td>{gasFormat.format(row.localGas)}</td>
                      <td>{gasFormat.format(row.liveGas)}</td>
                      <td>{row.liveGas === row.localGas ? "0" : gasFormat.format(row.liveGas - row.localGas)}</td>
                      <td>
                        {row.explorerUrl && row.txHash ? (
                          <a href={row.explorerUrl} target="_blank" rel="noopener noreferrer">{row.txHash.slice(0, 10)}…<span className="sr-only"> (opens the block explorer)</span></a>
                        ) : (row.txHash ? `${row.txHash.slice(0, 10)}…` : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="proof-facts live-facts">
              <div>
                <dt>Probe contract</dt>
                <dd className="proof-hash">
                  {liveEvidence.deployExplorerUrl
                    ? <a href={liveEvidence.deployExplorerUrl} target="_blank" rel="noopener noreferrer" title="Deployment transaction on the block explorer">{liveEvidence.address}</a>
                    : liveEvidence.address}
                </dd>
              </div>
              <div><dt>Transactions</dt><dd>{liveEvidence.transactionCount} sent, {liveEvidence.allTransactionsSucceeded ? "all succeeded" : "not all succeeded"}{liveEvidence.receiptsVerified ? ", receipts verified" : ""}</dd></div>
              <div><dt>Bytecode</dt><dd>{liveEvidence.bytecodeMatchesLocal ? "Same as the locally benchmarked build" : "Differs from the local build"}</dd></div>
              {liveEvidence.totalFeeMon && <div><dt>Total fees paid</dt><dd>{liveEvidence.totalFeeMon} testnet MON</dd></div>}
              <div><dt>Measured</dt><dd>{liveEvidence.measuredAt.slice(0, 16).replace("T", " ")} UTC</dd></div>
              <div><dt>Source file</dt><dd className="proof-hash">{liveEvidence.sourceFile}</dd></div>
            </dl>
            <p className="panel-footnote" style={{ marginBottom: 10 }}>This is the storage benchmark contract, not the auction. No auction contract is deployed.</p>
          </section>
        )}

        <div className="proof-columns">
          <section className="panel">
            <div className="panel-heading"><h2>How this was measured</h2></div>
            <dl className="proof-facts">
              <div><dt>Measured</dt><dd>{Number.isNaN(measuredAt.getTime()) ? "Unknown" : `${measuredAt.toISOString().slice(0, 16).replace("T", " ")} UTC`}</dd></div>
              <div><dt>Toolchain</dt><dd>Foundry {storageProvenance.forgeVersion}</dd></div>
              <div><dt>Before</dt><dd>{storageProvenance.beforeHardfork}</dd></div>
              <div><dt>After</dt><dd>{storageProvenance.afterHardfork}</dd></div>
              <div><dt>Bytecode</dt><dd>{storageProvenance.sameBytecode ? "Identical under both rule sets" : "Differs between rule sets"}</dd></div>
              <div><dt>Runtime SHA-256</dt><dd className="proof-hash">{storageProvenance.bytecodeSha256}</dd></div>
              <div><dt>Source file</dt><dd className="proof-hash">{storageProvenance.sourceFile}</dd></div>
            </dl>
          </section>

          <section className="panel">
            <div className="panel-heading"><h2>Not measured yet</h2></div>
            <ul className="proof-pending">
              {pending.map((item) => (
                <li key={item.name}>
                  <span className={`system-dot ${item.done ? "system-dot--ok" : ""}`} aria-hidden="true" />
                  <div>
                    <strong>{item.name}</strong> <span className="proof-pending-state">{item.done ? "Measured" : "Not measured"}</span>
                    <p>{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <div className="panel-heading"><h2>Contract addresses</h2></div>
            <dl className="proof-facts">
              {deployments.map(({ chain, chainId, deployment }) => (
                <div key={chainId}>
                  <dt>{chain} ({chainId})</dt>
                  <dd className={deployment ? "proof-hash" : undefined}>{deployment ? deployment.market : "Not deployed"}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <footer className="footer">
          <span>BATCHELOR <span className="brand-period">/</span> DEVELOPMENT BUILD</span>
          <span>Every number on this page is read from a benchmark file in the repository.</span>
        </footer>
      </div>
    </main>
  );
}
