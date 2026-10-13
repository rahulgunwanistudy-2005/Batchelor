import type { StorageScenario } from "@/lib/proof/benchmarks";

const gasFormat = new Intl.NumberFormat("en-US");

function ratio(scenario: StorageScenario): string {
  return `${(scenario.before / scenario.after).toFixed(2)}×`;
}

/**
 * Paired bars per scenario, MonadNine against MonadTen. The table is the
 * chart: every bar carries its exact value, so nothing depends on colour.
 * Bars share one linear scale per row, because rows differ by two orders
 * of magnitude and are not meant to be compared against each other.
 */
export function GasBars({ scenarios, rowLabel = "Probe" }: { scenarios: StorageScenario[]; rowLabel?: string }) {
  return (
    <div className="gas-bars">
      <ul className="gas-legend" aria-label="Series">
        <li><span className="gas-swatch gas-swatch--before" aria-hidden="true" /> MonadNine (before MIP-8)</li>
        <li><span className="gas-swatch gas-swatch--after" aria-hidden="true" /> MonadTen (after MIP-8)</li>
      </ul>
      <div className="gas-table-scroll">
        <table className="gas-table">
          <caption className="sr-only">Gas used in each row before and after MIP-8. Bars are scaled within each row.</caption>
          <thead>
            <tr><th scope="col">{rowLabel}</th><th scope="col">Gas used</th><th scope="col">Before ÷ after</th></tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => {
              const max = Math.max(scenario.before, scenario.after);
              const series = [
                { name: "MonadNine", tone: "before", value: scenario.before },
                { name: "MonadTen", tone: "after", value: scenario.after },
              ];
              return (
                <tr key={scenario.key}>
                  <th scope="row">{scenario.label}</th>
                  <td>
                    {series.map((bar) => (
                      <div className="gas-bar-row" key={bar.tone} title={`${scenario.label} · ${bar.name}: ${gasFormat.format(bar.value)} gas`}>
                        <span className="gas-bar-track">
                          <span className={`gas-bar gas-bar--${bar.tone}`} style={{ width: `${Math.max(0.5, (bar.value / max) * 100)}%` }} />
                        </span>
                        <span className="gas-bar-value"><span className="sr-only">{bar.name}: </span>{gasFormat.format(bar.value)}</span>
                      </div>
                    ))}
                  </td>
                  <td className="gas-ratio">{ratio(scenario)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="panel-footnote">Bars are scaled within each row, not across rows.</p>
    </div>
  );
}
