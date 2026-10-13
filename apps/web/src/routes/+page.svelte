<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  import { live, startLive, type Clear } from '$lib/chain/live';
  import { api } from '$lib/api/trading';
  import UncrossChart from '$lib/viz/UncrossChart.svelte';
  import BatchTape from '$lib/viz/BatchTape.svelte';
  import Ticket from '$lib/ui/Ticket.svelte';
  let { data }: { data: PageData } = $props();
  let now=$state(0), bot=$state<{awake?:boolean;remainingToday?:number;status?:string}|null>(null), botMessage=$state(''), botBusy=$state(false);
  const progress=$derived($live.headAt ? Math.min(100,Math.max(0,(now-$live.headAt)/$live.intervalMs*100)) : 0);
  const batches=$derived.by(() => { const indexed:Clear[]=data.batches.map(b=>({batchId:b.batchId,clearTick:b.clearTick ?? 0,price:b.price ?? 0n,volumeLots:b.volumeLots,clearGas:Number(b.clearGas ?? 0n)})); return [...$live.clears,...indexed.filter(b=>!$live.clears.some(c=>c.batchId===b.batchId))].slice(0,60); });
  async function health() { try { bot=await api('/api/wake'); } catch { bot=null; } }
  async function unleash() { botBusy=true; botMessage=''; try { bot=await api('/api/wake',{action:'unleash'}); botMessage='Pete is unleashed. Watch the next batches.'; await health(); } catch(e) { botMessage=e instanceof Error ? e.message : 'Pete could not start.'; } finally { botBusy=false; } }
  onMount(() => { const stop=startLive(); void health(); void api('/api/wake',{action:'wake'}).catch(()=>undefined); const clock=setInterval(()=>now=Date.now(),50), bots=setInterval(()=>void health(),10_000); return()=>{stop();clearInterval(clock);clearInterval(bots);}; });
</script>
<svelte:head><title>Batchelor · Trade</title><meta name="description" content="Buy and sell orders in the same block meet at a single price." /></svelte:head>
<section class="intro"><h1>One batch. One clearing price.</h1><p>Buy and sell orders in the same block meet at a single price.</p></section>
<div class="trade-grid">
  <section class="card book" aria-labelledby="book-title">
    <div class="card-heading"><h2 id="book-title">ROSE / dUSD</h2><div class="legend"><span class="bid">Buy orders</span><span class="ask">Sell orders</span></div></div>
    {#if $live.head!==null}<p class="batch">{$live.batch?.hasOpen ? `Batch #${$live.batch.id} · ${$live.batch.orderCount} orders` : 'Waiting for the next batch'} · Block {$live.head}</p><div class="progress" aria-hidden="true"><span style={`width:${progress}%`}></span></div><UncrossChart state={$live} />
    {:else}<div class="book-empty"><div><h3>The next batch starts here</h3><p>{$live.status==='unconfigured' ? 'The order book will appear when a market is connected.' : 'Connecting to the live market…'}</p></div></div>{/if}
    {#if $live.status==='reconnecting'}<p role="status">Reconnecting… Using the latest available market data.</p>{/if}
    <BatchTape {batches} /><p class="card-note">Within a batch, order arrival time does not set the clearing price.</p>
    <div class="bots"><p>{bot?.awake===true ? 'Liquidity bot is awake.' : bot?.awake===false ? 'Liquidity bot is asleep. It wakes when you place an order.' : 'Liquidity bot status is unavailable.'}</p><button class="secondary" disabled={botBusy || !bot || bot.status!=='ok' || bot.remainingToday===0} onclick={unleash}>Unleash Pete</button>{#if bot?.remainingToday!==undefined}<span>{bot.remainingToday} left today</span>{/if}</div>
    {#if botMessage}<p role="status">{botMessage}</p>{/if}
  </section>
  <Ticket />
</div>
{#if data.indexerMessage}<p class="receipt-note">{data.indexerMessage}</p>{/if}
<style>.batch { margin:20px 0 8px; font-size:14px; }.progress { height:3px; background:var(--line); overflow:hidden; }.progress span { display:block; height:100%; background:var(--clear); }.bots { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-top:20px; }.bots p { flex-basis:100%; }.bots span { font-size:14px; }@media(prefers-reduced-motion:reduce){.progress span{width:100% !important;}}</style>
