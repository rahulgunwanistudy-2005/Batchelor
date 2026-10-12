<script lang="ts">
  import type { PageData } from './$types';
  import { formatUnits } from 'viem';
  import { invalidateAll } from '$app/navigation';
  let { data }: { data: PageData } = $props();
  const receipt = $derived(data.receipt);
  const explorer = $derived(receipt?.chainId === 143 ? 'https://monadscan.com' : 'https://testnet.monadscan.com');
  const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
</script>
<svelte:head><title>Batch receipt · Batchelor</title></svelte:head>
{#if receipt}
  <section class="intro">
    <h1>{receipt.placedCount} orders{receipt.price !== null && receipt.volumeLots > 0n ? `, one price: ${formatUnits(receipt.price, 6)} dUSD.` : receipt.clearedBlock === null ? ', awaiting clearing.' : ', no matched volume.'}</h1>
    <p>Batch #{receipt.batchId.toString()} · {receipt.chainId === 143 ? 'Monad mainnet' : 'Monad testnet'} · {receipt.relayedCount} relayed orders.</p>
  </section>
  <section class="card">
    <h2>Priority fees and fills</h2>
    <p>Orders appear in transaction order. Filled orders settle at the same clearing price.</p>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can scroll the receipt table.) -->
    <div class="table-scroll" role="region" aria-label="Orders in transaction order" tabindex="0">
      <table>
        <thead><tr><th>Order</th><th>Trader</th><th>Position</th><th>Priority (MON-gwei)</th><th>Side</th><th>Fill (ROSE)</th><th>Quote (dUSD)</th><th>Status</th></tr></thead>
        <tbody>{#each receipt.orders as order (order.id)}
          <tr class:viewer={order.trader.address.toLowerCase() === data.viewer}>
            <td><a href={`${explorer}/tx/${order.txHash}`} target="_blank" rel="noreferrer">#{order.orderId.toString()}</a></td>
            <td>{short(order.trader.address)}{order.trader.address.toLowerCase() === data.viewer ? ' (you)' : ''}</td>
            <td>{order.txIndex}:{order.logIndex}</td>
            <td><span class="fee" style={`--fee-width: ${receipt.maxPriorityFeePerGas === 0n ? 0 : Number(order.priorityFeePerGas * 100n / receipt.maxPriorityFeePerGas)}%`}></span>{formatUnits(order.priorityFeePerGas, 9)}</td>
            <td class:bid={order.side === 0} class:ask={order.side === 1}>{order.side === 0 ? 'Buy' : 'Sell'}</td>
            <td>{formatUnits(order.side === 0 ? order.baseOut : order.baseIn, 18)} ROSE</td>
            <td>{formatUnits(order.side === 0 ? order.quoteIn : order.quoteOut, 6)} dUSD</td>
            <td>{order.cancelled ? 'Cancelled' : order.claimed ? 'Claimed' : receipt.clearedBlock === null ? 'Open' : 'Cleared'}</td>
          </tr>
        {/each}</tbody>
      </table>
    </div>
  </section>
  <section class="card facts">
    <h2>Batch facts</h2>
    <dl>
      <dt>Matched volume</dt><dd>{formatUnits(receipt.volumeLots * 10n ** 15n, 18)} ROSE</dd>
      <dt>Clear tick</dt><dd>{receipt.clearTick ?? 'Pending'}</dd>
      <dt>Buy / sell cutoff</dt><dd>{receipt.buyCutoff ?? 'Pending'} / {receipt.sellCutoff ?? 'Pending'}</dd>
      <dt>Clearing gas</dt><dd>{receipt.clearGas?.toLocaleString() ?? 'Pending'}</dd>
      <dt>Median priority fee</dt><dd>{formatUnits(receipt.medianPriorityFeePerGas, 9)} MON-gwei</dd>
      <dt>Clearing block</dt><dd>{receipt.clearedBlock?.toString() ?? 'Pending'}</dd>
    </dl>
    {#if receipt.clearTxHash}<a href={`${explorer}/tx/${receipt.clearTxHash}`} target="_blank" rel="noreferrer">View clearing transaction</a>{/if}
  </section>
{:else}
  <section class="intro"><h1>Batch receipt</h1><p>{data.message}</p></section>
{/if}
<button onclick={() => invalidateAll()}>Refresh receipt</button>
<style>
  .table-scroll { overflow-x: auto; margin-top: 20px; }
  .table-scroll:focus-visible { outline: 3px solid var(--clear); }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { white-space: nowrap; text-align: left; padding: 12px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); }
  .viewer { outline: 2px solid var(--clear); outline-offset: -2px; }
  a { text-decoration: underline; text-underline-offset: 3px; }
  .fee { display: block; width: var(--fee-width); height: 4px; background: var(--muted); margin-bottom: 6px; }
  .facts { margin: 24px 0; }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
  dt { color: var(--muted); } dd { margin: 0; }
  button { color: var(--ink); margin-top: 20px; cursor: pointer; }
</style>
