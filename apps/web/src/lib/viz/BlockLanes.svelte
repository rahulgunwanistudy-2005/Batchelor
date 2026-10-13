<script lang="ts">
  import type { IndexedOrder } from '$lib/api/graphql';
  import { actorOf, batchFillLots, logFeeWidth, priceText, shortAddress, tickToPrice, type ActorConfig } from '$lib/receipt';
  import { formatUnits } from '@batchelor/core/format';
  let { orders, actors, viewer, price, pending=false }: {orders:IndexedOrder[];actors:ActorConfig;viewer:string|null;price:bigint|null;pending?:boolean}=$props();
  const max=$derived(orders.reduce((m,o)=>o.priorityFeePerGas>m?o.priorityFeePerGas:m,0n));
</script>
<!-- svelte-ignore a11y_no_noninteractive_tabindex (Focus enables keyboard scrolling of complete receipt data.) -->
<div class="table-scroll" tabindex="0" role="region" aria-label="Priority fees and fills in block transaction order">
<table>
  <caption>Bar widths use a logarithmic fee scale. Filled dots share one price: {price===null?'pending':priceText(price)}.</caption>
  <thead><tr><th scope="col">Order / block position</th><th scope="col">Trader</th><th scope="col">Priority (MON-gwei)</th><th scope="col">Side / limit</th><th scope="col">Fill at clearing price</th><th scope="col">Status</th></tr></thead>
  <tbody>{#each orders as order (order.id)}
    {@const actor=actorOf(order.trader.address,actors)}
    {@const filled=!order.cancelled && (order.side===0?order.baseOut:order.baseIn)>0n}
    <tr class:viewer={order.trader.address.toLowerCase()===viewer}>
      <th scope="row">#{order.orderId.toString()}<small>Block {order.blockNumber.toString()} · {order.txIndex}:{order.logIndex}</small></th>
      <td>{actor==='pete'?'Pete (bot)':actor==='mo'?'Mo (market maker bot)':shortAddress(order.trader.address)}{order.trader.address.toLowerCase()===viewer?' (you)':''}</td>
      <td><span class="fee-track" aria-hidden="true"><span style={`width:${logFeeWidth(order.priorityFeePerGas,max)}%`}></span></span>{formatUnits(order.priorityFeePerGas,9)}</td>
      <td class:bid={order.side===0} class:ask={order.side===1}>{order.side===0?'Buy':'Sell'}<small>{priceText(tickToPrice(order.tick))}</small></td>
      <td class="fill"><span class="marker" aria-hidden="true"><span class:filled></span></span>{batchFillLots(order)} lots{#if filled}<small>{priceText(price!)}</small>{/if}</td>
      <td>{order.cancelled?'Cancelled':pending?'Open':!filled?'Unfilled':order.claimed?'Claimed':'Cleared'}</td>
    </tr>
  {/each}</tbody>
</table>
</div>
<style>
.table-scroll{overflow-x:auto;margin-top:20px}.table-scroll:focus-visible{outline:3px solid var(--clear)}table{width:100%;border-collapse:collapse;font-size:14px}caption{text-align:left;color:var(--muted);margin-bottom:16px}th,td{padding:14px 12px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}thead th{color:var(--muted);font-weight:500}small{display:block;font-size:14px;color:var(--muted)}.viewer{outline:2px solid var(--clear);outline-offset:-2px}.fee-track{display:block;width:140px;height:6px;background:var(--line);margin-bottom:6px;border-radius:4px}.fee-track span{display:block;height:100%;background:var(--muted);border-radius:4px}.marker{display:inline-flex;width:28px;border-left:2px solid var(--clear);height:26px;vertical-align:middle;align-items:center}.marker span.filled{display:block;width:10px;height:10px;border-radius:50%;background:var(--clear);margin-left:-6px}.fill small{margin-left:28px}
</style>
