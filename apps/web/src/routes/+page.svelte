<script lang="ts">
  import type { PageData } from './$types';
  import { formatUnits } from 'viem';
  let { data }: { data: PageData } = $props();
  import { en } from '$lib/copy/en';
</script>

<svelte:head><title>{en.brand} · {en.nav.trade}</title><meta name="description" content={en.trade.description} /></svelte:head>
<section class="intro">
  <h1>{en.trade.title}</h1>
  <p>{en.trade.description}</p>
</section>
<div class="trade-grid">
  <section class="card book" aria-labelledby="book-title">
    <div class="card-heading"><h2 id="book-title">{en.trade.market}</h2><div class="legend"><span class="bid">{en.trade.demand}</span><span class="ask">{en.trade.supply}</span></div></div>
    <div class="book-empty">
      <svg viewBox="0 0 600 220" aria-hidden="true" preserveAspectRatio="none"><path d="M25 10V195H580" /><path class="grid" d="M25 60H580M25 105H580M25 150H580M135 10V195M245 10V195M355 10V195M465 10V195" /></svg>
      <div><h3>{en.trade.book}</h3><p>{en.trade.empty}</p></div>
    </div>
    <p class="card-note">{en.trade.fairness}</p>
  </section>
  <section class="card ticket" aria-labelledby="ticket-title">
    <h2 id="ticket-title">{en.trade.ticket}</h2>
    <p>{en.trade.ticketDescription}</p>
    <div class="sides"><span class="bid">{en.trade.buy}</span><span class="ask">{en.trade.sell}</span></div>
    <button disabled>{en.trade.notReady}</button>
    <p class="muted small">{en.trade.next}</p>
  </section>
</div>
<p class="receipt-note">{en.trade.receipt}</p>

<section class="card history">
  <h2>Recent batches</h2>
  {#if data.batches.length}
    <ul>{#each data.batches as batch (batch.id)}<li><a href={`/b/${batch.batchId.toString()}`}>Batch #{batch.batchId.toString()} · {batch.volumeLots > 0n && batch.price !== null ? `${formatUnits(batch.price, 6)} dUSD` : 'No matched volume'} · {batch.orderCount} active orders</a></li>{/each}</ul>
  {:else}<p>{data.indexerMessage ?? 'No cleared batches have been indexed yet.'}</p>{/if}
</section>
<style>
  .history { margin-top: 24px; } ul { list-style: none; padding: 0; margin: 0; }
  li { border-top: 1px solid var(--line); padding: 12px 0; }
  a { text-decoration: underline; text-underline-offset: 3px; }
</style>
