<script lang="ts">
  import type { PageData } from './$types';
  import { formatUnits } from 'viem';
  let { data }: { data: PageData } = $props();
</script>
<svelte:head><title>My orders · Batchelor</title></svelte:head>
<section class="intro"><h1>My orders</h1><p>Recent orders and fills from Monad.</p></section>
<section class="card">
  <form method="GET"><label for="trader">Trader address</label><input id="trader" name="trader" value={data.trader} placeholder="0x…" required /><button>View orders</button></form>
  {#if data.message}<p role="status">{data.message}</p>
  {:else if !data.orders.length}<p>No indexed orders for this address yet.</p>
  {:else}
    <ul>{#each data.orders as order (order.id)}<li>
      <a href={`/b/${order.batch.batchId.toString()}?trader=${data.trader}`}>Order #{order.orderId.toString()} · {order.side === 0 ? 'Buy' : 'Sell'}</a>
      <p>{formatUnits(order.lots * 10n ** 15n, 18)} ROSE · {order.cancelled ? 'Cancelled' : order.claimed ? 'Claimed' : order.batch.clearedBlock === null ? 'Open' : 'Cleared · awaiting claim'}</p>
      <p>Filled: {formatUnits(order.side === 0 ? order.baseOut : order.baseIn, 18)} ROSE</p>
    </li>{/each}</ul>
    <p>Showing the latest {data.orders.length} orders.</p>
  {/if}
</section>
<style>
  form { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; align-items: center; }
  input { min-width: 0; flex: 1; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; }
  input:focus-visible { outline: 3px solid var(--clear); outline-offset: 3px; }
  label { flex-basis: 100%; } button { color: var(--ink); cursor: pointer; }
  ul { list-style: none; padding: 0; } li { padding: 16px 0; border-top: 1px solid var(--line); }
  a { text-decoration: underline; text-underline-offset: 3px; }
</style>
