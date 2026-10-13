<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { walletAccount } from '$lib/wallet/session';
  import { formatUnits, LOT } from '@batchelor/core/format';
  import { replayLabel } from '@batchelor/core/replay';
  import { actorOf, amountText, comparison, priceText, receiptModel } from '$lib/receipt';
  import BlockLanes from '$lib/viz/BlockLanes.svelte';
  let {data}:{data:PageData}=$props();
  let shareMessage=$state(''), ready=$state(false);
  onMount(()=>{ready=true;});
  const receipt=$derived(data.receipt);
  const model=$derived(receipt?receiptModel(receipt,data.actors):null);
  const viewer=$derived($walletAccount?.address.toLowerCase()??data.viewer);
  const explorer=$derived(receipt?.chainId===143?'https://monadvision.com':'https://testnet.monadvision.com');
  const comparisons=$derived.by(()=>{
    if(!receipt||!model)return [];
    const yourOrders=model.orders.filter(o=>o.trader.address.toLowerCase()===viewer && !o.cancelled);
    const pete=model.orders.filter(o=>actorOf(o.trader.address,data.actors)==='pete' && !o.cancelled);
    return [...(yourOrders.length?[{label:'You',...comparison(yourOrders,model.simulation,receipt.price)}]:[]),...(pete.length?[{label:'Pete',...comparison(pete,model.simulation,receipt.price)}]:[])];
  });
  async function share(){try{await navigator.clipboard.writeText(data.canonical);shareMessage='Receipt link copied.';}catch{shareMessage=`Copy this link: ${data.canonical}`;}}
</script>
<svelte:head>
  <title>{model?`Batch #${receipt!.batchId} · ${model.headline}`:'Batch receipt'} · Batchelor</title>
  <meta name="description" content={model?.description??data.message??'Batch receipt'} />
  <link rel="canonical" href={data.canonical}/>
  <meta property="og:type" content="website"/><meta property="og:title" content={model?.headline??'Batch receipt · Batchelor'}/>
  <meta property="og:description" content={model?.description??data.message??'Batch receipt'}/><meta property="og:url" content={data.canonical}/>
  {#if receipt}<meta property="og:image" content={data.image}/><meta property="og:image:type" content="image/png"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:image" content={data.image}/>{/if}
</svelte:head>
{#if receipt && model}
  <section class="intro"><p class="batch-id">Batch #{receipt.batchId.toString()} · {receipt.chainId===143?'Monad mainnet':'Monad testnet'}</p><h1>{model.headline}</h1><p>{model.description}</p><div class="actions"><button disabled={!ready} onclick={share}>Share receipt</button><button class="secondary" disabled={!ready} onclick={()=>invalidateAll()}>Refresh receipt</button></div><p role="status">{shareMessage}</p></section>
  <section class="card"><h2>Priority fees and fills</h2><p>Arrival order and priority fees are visible below. Limits and pro-rata cutoffs determine quantities; filled orders share the clearing price.</p><BlockLanes orders={model.orders} actors={data.actors} {viewer} price={receipt.price} pending={receipt.clearedBlock===null}/></section>
  <section class="card comparison"><h2>The same orders on a continuous book</h2><p>{replayLabel}</p>
    {#if receipt.orders.some(o=>o.cancelled)}<p class="note">Cancelled orders are excluded. Their cancellation timing is not available, so this replay cannot reconstruct temporary liquidity before cancellation.</p>{/if}
    {#if receipt.clearedBlock===null}<p class="note">Batch comparisons will be available after clearing.</p>
    {:else if comparisons.length}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard focus enables scrolling of exact comparison values.) -->
      <div class="table-scroll" tabindex="0" role="region" aria-label="Continuous and batch price comparisons"><table><thead><tr><th scope="col">Trader</th><th scope="col">Continuous average</th><th scope="col">Batch price</th><th scope="col">Continuous − batch</th><th scope="col">Replay fill</th><th scope="col">Batch fill</th></tr></thead><tbody>{#each comparisons as row}<tr><th scope="row">{row.label}</th><td>{row.average===null?'No comparable fills':priceText(row.average)}</td><td>{row.batchBase>0n&&receipt.price!==null?priceText(receipt.price):'No batch fill'}</td><td>{row.difference===null?'Unavailable':`${formatUnits(row.difference,6)} dUSD (${formatUnits(row.percent!,2)}%)`}</td><td>{amountText(row.filledLots*LOT,18)} ROSE</td><td>{amountText(row.batchBase,18)} ROSE</td></tr>{/each}</tbody></table></div>
      <p class="note">Difference is per ROSE. Replay averages are weighted by matched lots; batch and replay quantities can differ. Pete totals include all configured Pete accounts.</p>
    {:else}<p class="note">No Pete orders in this batch. Sign in to see your comparison if you traded here.</p>{/if}
  </section>
  <section class="card facts"><h2>Batch facts</h2><dl>
    <dt>Clearing tick / price</dt><dd>{receipt.clearTick??'Pending'} / {receipt.volumeLots>0n&&receipt.price!==null?priceText(receipt.price):receipt.clearedBlock===null?'Pending':'No trade'}</dd>
    <dt>Matched volume</dt><dd>{amountText(receipt.volumeLots*LOT,18)} ROSE</dd>
    <dt>Buy cutoff / fraction</dt><dd>{receipt.clearedBlock===null?'Pending':receipt.volumeLots===0n?'No trade':`${receipt.buyCutoff} · ${receipt.rB} / ${receipt.mB}`}</dd>
    <dt>Sell cutoff / fraction</dt><dd>{receipt.clearedBlock===null?'Pending':receipt.volumeLots===0n?'No trade':`${receipt.sellCutoff} · ${receipt.rS} / ${receipt.mS}`}</dd>
    <dt>Clearing gas</dt><dd>{receipt.clearGas?.toLocaleString('en-US')??'Pending'}</dd>
    <dt>Clearing block</dt><dd>{#if receipt.clearedBlock!==null}<a href={`${explorer}/block/${receipt.clearedBlock}`} target="_blank" rel="noreferrer">{receipt.clearedBlock.toString()}</a>{:else}Pending{/if}</dd>
    <dt>Cleared at (UTC)</dt><dd>{receipt.clearedAtTimestamp===null?'Pending':new Date(Number(receipt.clearedAtTimestamp)*1000).toISOString().replace('T',' ').replace('.000Z',' UTC')}</dd>
    <dt>Placed / active orders</dt><dd>{receipt.placedCount} / {receipt.orderCount}</dd>
  </dl><p class="note">Clearing gas measures internal auction execution, before the event and transaction overhead.</p>
  <details><summary>All transactions on MonadVision</summary><ul>{#if receipt.clearTxHash}<li><a href={`${explorer}/tx/${receipt.clearTxHash}`} target="_blank" rel="noreferrer">Clear · {receipt.clearTxHash}</a></li>{/if}{#each [...new Set(model.orders.flatMap(o=>[o.txHash,...(o.claimTxHash?[o.claimTxHash]:[])]))] as hash}<li><a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a></li>{/each}</ul></details></section>
{:else}<section class="intro"><h1>Batch receipt</h1><p>{data.message}</p><button onclick={()=>invalidateAll()}>Refresh receipt</button></section>{/if}
<style>.batch-id{font-size:14px;margin-bottom:16px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0 12px}.comparison,.facts{margin-top:24px}.note{font-size:14px;margin-top:16px}.table-scroll{overflow-x:auto;margin-top:20px}.table-scroll:focus-visible{outline:3px solid var(--clear)}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:12px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}dl{display:grid;grid-template-columns:1fr 1fr;gap:12px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}a{text-decoration:underline;text-underline-offset:3px}details{margin-top:24px}summary{cursor:pointer}ul{padding-left:20px}li{overflow-wrap:anywhere;margin:8px 0}@media(max-width:480px){dl{grid-template-columns:1fr;gap:4px}dd{margin-bottom:12px}}</style>
