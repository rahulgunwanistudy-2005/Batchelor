import type { Metadata } from "next";
import { GasBars } from "@/components/proof/GasBars";
import { TopBar } from "@/components/terminal/TopBar";
import { deployments, pendingMeasurements, storageProvenance, storageScenarios } from "@/lib/proof/benchmarks";

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
    {
      name: "Live testnet measurement",
      done: pendingMeasurements.liveTestnetStatus === "measured",
      detail: pendingMeasurements.liveTestnetReason,
    },
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
          <p className="proof-caveat">
            These are local storage-probe measurements, not auction clearing costs. Each figure includes the probe&apos;s own loop, bounds-check and checksum work, and excludes transaction overhead.
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
