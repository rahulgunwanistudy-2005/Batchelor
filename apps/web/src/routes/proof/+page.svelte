<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  import { en } from '$lib/copy/en';
  import bench from '@batchelor/core/bench.json';
  import { gasLimits } from '@batchelor/core/gas';
  const scenarios = bench.scenarios.filter((row) => row.name.startsWith('clear'));
  const largest = Math.max(...scenarios.map((row) => row.monadNine));
  const full = scenarios.find((row) => row.activeTicks === 256)!;
  const format = (n: number) => n.toLocaleString('en-US');
</script>
<svelte:head><title>{en.nav.proof} · {en.brand}</title></svelte:head>
<section class="intro"><h1>{en.proof.title}</h1><p>{en.proof.description}</p></section>
<section class="card measurements">
  <h2>A full book clears with {full.ratio.toFixed(2)}× less gas</h2>
  <p>Same production bytecode, two storage rules. Local measurements reproduced twice.</p>
  <div class="gas-legend"><span>MonadNine · before MIP-8</span><span>MonadTen · after MIP-8</span></div>
  <svg viewBox="0 0 640 256" role="img" aria-labelledby="gas-title gas-description">
    <title id="gas-title">Clearing gas before and after MIP-8</title>
    <desc id="gas-description">For 512 active ticks, clearing uses {format(full.monadNine)} gas before and {format(full.monadTen)} gas after MIP-8. Exact values for all four books follow in the table.</desc>
    {#each scenarios as row, i}
      <text x="0" y={i * 64 + 26}>{row.activeTicks * 2} ticks</text>
      <rect class="before" x="110" y={i * 64 + 8} width={row.monadNine / largest * 520} height="16" rx="3" />
      <rect class="after" x="110" y={i * 64 + 30} width={row.monadTen / largest * 520} height="16" rx="3" />
    {/each}
  </svg>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard focus allows horizontal scrolling on narrow screens.) -->
  <div class="table-scroll" tabindex="0" role="region" aria-label="Clearing benchmark measurements">
    <table>
      <caption>Active ticks across both sides; gas inside clearing, before event and transaction overhead.</caption>
      <thead><tr><th scope="col">Active ticks</th><th scope="col">MonadNine</th><th scope="col">MonadTen</th><th scope="col">Reduction</th></tr></thead>
      <tbody>{#each scenarios as row}<tr><th scope="row">{row.activeTicks * 2}</th><td>{format(row.monadNine)}</td><td>{format(row.monadTen)}</td><td>{row.ratio.toFixed(2)}×</td></tr>{/each}</tbody>
    </table>
  </div>
  <p class="card-note">An order reserves {format(gasLimits.placeSelfClear)} gas to include a possible full-range self-clear. At 100 MON-gwei and zero priority fee, that declared limit costs {(gasLimits.placeSelfClear / 1e7).toFixed(4)} MON. Fees change with gas price.</p>
</section>
<section class="card measurements">
  <h2>Live clearing gas</h2>
  {#if data.stats && data.stats.count > 0}
    <p>Median: {data.stats.medianClearGas?.toLocaleString() ?? 'Unavailable'} gas across the last {data.stats.count} indexed batches.</p>
  {:else}<p>{data.indexerMessage ?? 'No cleared batches have been indexed yet.'}</p>{/if}
</section>
<div class="proof-grid">
  <section class="card"><h2>{en.proof.storage}</h2><p>{en.proof.storageDetail}</p></section>
  <section class="card"><h2>{en.proof.settlement}</h2><p>{en.proof.settlementDetail}</p></section>
  <section class="card"><h2>{en.proof.clearing}</h2><p>{en.proof.clearingDetail}</p></section>
  <section class="card"><h2>Testnet confirmation</h2>
    {#if bench.liveTestnet.status === 'passed'}
      <p>128 ticks per side cleared in {format(bench.liveTestnet.live)} gas on Monad testnet, matching the local {format(bench.liveTestnet.local)}-gas fixture.</p>
      <p class="receipt-note"><a href={`https://testnet.monadscan.com/tx/${bench.liveTestnet.hash}`} target="_blank" rel="noreferrer">View the clearing transaction</a></p>
    {:else}<p>Live confirmation is pending. Local measurements are shown above.</p>{/if}
    <p class="receipt-note">{en.proof.deployedDetail}</p>
  </section>
</div>
<style>
  .measurements { margin-bottom: 24px; }
  .gas-legend { display: flex; flex-wrap: wrap; gap: 12px 28px; margin: 24px 0 8px; font-size: 14px; }
  .gas-legend span:first-child { color: var(--muted); }
  .gas-legend span:last-child { color: var(--clear); }
  svg { display: block; width: 100%; max-width: 800px; margin: 16px 0; }
  text { fill: var(--ink); font-family: 'IBM Plex Sans', sans-serif; font-size: 14px; }
  .before { fill: var(--muted); }.after { fill: var(--clear); }
  a { text-decoration: underline; text-underline-offset: 3px; }
  .table-scroll { overflow-x: auto; margin-bottom: 20px; }
  .table-scroll:focus-visible { outline: 3px solid var(--clear); outline-offset: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  caption { text-align: left; color: var(--muted); padding-bottom: 12px; }
  th, td { text-align: right; padding: 12px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th:first-child { text-align: left; }
</style>
