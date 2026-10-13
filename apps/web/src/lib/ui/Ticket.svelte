<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { formatUnits, parseUnits, type Hex } from 'viem';
  import { batchAuctionAbi, escrowFor, transactionGas } from '@batchelor/core';
  import { live } from '$lib/chain/live';
  import { chainConfig, publicClient } from '$lib/chain/client';
  import { walletAccount } from '$lib/wallet/session';
  import { api, signedOrder, confirmed, placedOrder } from '$lib/api/trading';
  import Account from './Account.svelte';
  let side = $state(0), tick = $state(100), amount = $state('1'), busy = $state(false), message = $state('');
  let refreshing = false;
  let dataError = $state('');
  let balances = $state<readonly [bigint,bigint] | null>(null), error = $state(''), hash = $state<Hex | null>(null);
  let order = $state<{ orderId: bigint; batchId: bigint; side: number } | null>(null), preview = $state<{ price: bigint; base: bigint; quote: bigint; refund: bigint; matched: boolean } | null>(null);
  const price = $derived($live.minPrice + BigInt(Math.max(0,Math.min(255,tick || 0))) * $live.tickSize);
  const lots = $derived.by(() => { try { const base = parseUnits(amount,18); if (!/^\d+(\.\d{1,18})?$/.test(amount) || base <= 0n || !$live.lot || base % $live.lot !== 0n) return 0n; return base / $live.lot; } catch { return 0n; } });
  const total = $derived(lots ? side === 0 ? escrowFor(side,lots,price,$live.lot) : lots*$live.lot*price/10n**18n : 0n);
  const available = $derived(balances ? balances[side === 0 ? 1 : 0] : 0n);
  const enough = $derived(lots > 0n && lots < 1n<<64n && (side === 0 ? total : lots*$live.lot) <= available);
  async function refresh() {
    if (refreshing) return;
    const c = chainConfig(), account = $walletAccount;
    if (!c || !account) { balances = null; return; }
    refreshing = true;
    try {
      const value = await publicClient().readContract({ address:c.market, abi:batchAuctionAbi, functionName:'balances',args:[account.address] });
      if ($walletAccount?.address !== account.address) return;
      balances = value; dataError = '';
      const pending = order;
      if (pending && !preview) {
        const result = await publicClient().readContract({ address:c.market, abi:batchAuctionAbi, functionName:'result',args:[pending.batchId] });
        if (result.clearedAt > 0n) {
          const [baseDelta,quoteDelta,refund] = await publicClient().readContract({ address:c.market, abi:batchAuctionAbi, functionName:'previewFill',args:[pending.orderId] });
          const stored = await publicClient().readContract({ address:c.market, abi:batchAuctionAbi, functionName:'orders',args:[pending.orderId] });
          // previewFill is zero after a keeper claim. Reconstruct exact deltas from immutable result/order.
          const { fill } = await import('@batchelor/core');
          const settled = fill({side:stored[1],tick:stored[2],lots:stored[4],escrow:stored[6]},result,$live.minPrice+BigInt(result.clearTick)*$live.tickSize,$live.lot);
          if ($walletAccount?.address !== account.address || order?.orderId !== pending.orderId) return;
          preview = {price: $live.minPrice+BigInt(result.clearTick)*$live.tickSize, base: stored[3] ? (pending.side===0 ? settled.baseOut : settled.baseIn) : baseDelta < 0n ? -baseDelta : baseDelta, quote: stored[3] ? (pending.side===0 ? settled.quoteIn : settled.quoteOut) : quoteDelta < 0n ? -quoteDelta : quoteDelta, refund:stored[3] ? settled.refund : refund, matched:result.volumeLots>0n};
          message = preview.base > 0n ? `Cleared at ${formatUnits(preview.price,6)} dUSD` : 'Cleared with no fill. Your escrow is refundable.';
        }
      }
    } catch { dataError = 'Balances or settlement are temporarily unavailable. Try refreshing.'; }
    finally { refreshing = false; }
  }
  $effect(() => { const address = $walletAccount?.address; balances = null; order = null; preview = null; message = ''; hash = null; if(address) untrack(() => void refresh()); });
  onMount(() => { const timer=setInterval(() => void refresh(),1000); return () => clearInterval(timer); });
  async function drip() {
    busy=true; error=''; message='Requesting demo tokens…';
    try { const result=await api<{hash:Hex}>('/api/drip',{trader:$walletAccount!.address}); hash=result.hash; await confirmed(result.hash); message='100 ROSE and 100 dUSD added to your trading balance.'; await refresh(); }
    catch(e) { error=e instanceof Error ? e.message : 'Demo-token request failed.'; message=''; }
    finally { busy=false; }
  }
  async function place() {
    if (!enough) { error='Check your amount and balance. Amounts must use whole lots.'; return; }
    busy=true; error=''; preview=null; order=null; message='Sign your order…';
    try { const result=await signedOrder(0,side,tick,lots); hash=result.hash; message='Order submitted. Waiting for the next block…'; order=await placedOrder(result.hash); message=`In batch #${order.batchId}. Clearing next block.`; await refresh(); }
    catch(e) { error=e instanceof Error ? e.message : 'Order failed. Try again.'; message=''; }
    finally { busy=false; }
  }
</script>
<section class="card ticket" aria-labelledby="ticket-title">
  <h2 id="ticket-title">Your order</h2><Account />
  {#if $walletAccount}<p>Available: {balances ? `${formatUnits(balances[0],18)} ROSE · ${formatUnits(balances[1],6)} dUSD` : 'Loading balances…'}</p>{/if}
  <div class="sides" role="group" aria-label="Order side"><button aria-pressed={side===0} class:chosen={side===0} class="bid" onclick={() => side=0}>Buy ROSE</button><button aria-pressed={side===1} class:chosen={side===1} class="ask" onclick={() => side=1}>Sell ROSE</button></div>
  <label for="limit">Limit price</label><div class="stepper"><button aria-label="Lower limit by one tick" disabled={tick<=0} onclick={() => tick--}>−</button><input id="limit" type="number" min="0" max="255" step="1" bind:value={tick} aria-label="Limit price tick" /><button aria-label="Raise limit by one tick" disabled={tick>=255} onclick={() => tick++}>+</button></div>
  <p>{$live.tickSize ? `${formatUnits(price,6)} dUSD per ROSE` : 'Waiting for market parameters'}</p>
  <label for="amount">Amount in ROSE</label><input id="amount" inputmode="decimal" bind:value={amount} />
  <p>{side===0 ? "You'll pay at most" : "You'll sell for at least"} {$live.tickSize ? formatUnits(total,6) : '—'} dUSD</p>
  <p class="small">Network fee: covered by Batchelor, charged on {transactionGas('placeFor').toLocaleString()} gas.</p>
  {#if $walletAccount && balances && (balances[0]===0n || balances[1]===0n)}<button class="secondary" disabled={busy} onclick={drip}>Get 100 ROSE and 100 dUSD</button>{/if}
  <button class="primary" disabled={busy || !$walletAccount || !enough || !Number.isInteger(tick) || tick<0 || tick>255 || !$live.head} onclick={place}>{busy ? 'Confirming…' : side===0 ? 'Place buy order' : 'Place sell order'}</button>
  {#if !lots && $live.lot}<p class="small">Enter a multiple of {formatUnits($live.lot,18)} ROSE.</p>{/if}
  {#if message}<p role="status">{message}</p>{/if}
  {#if dataError}<p role="status">{dataError}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if preview}<p>Filled {formatUnits(preview.base,18)} ROSE for {formatUnits(preview.quote,6)} dUSD. Refund: {formatUnits(preview.refund,order?.side===0 ? 6 : 18)} {order?.side===0 ? 'dUSD' : 'ROSE'}.</p>{/if}
  {#if order}<a class="text-link" href={`/b/${order.batchId}?trader=${$walletAccount?.address ?? ''}`}>See this batch</a>{/if}
  {#if hash}<a class="text-link small" href={`${chainConfig()?.chain.blockExplorers?.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction</a>{/if}
</section>
<style>.stepper { display:flex; gap:8px; }.stepper input { width:100%; min-width:0; }.chosen { outline:2px solid currentColor; outline-offset:-2px; }.ticket label { margin-bottom:-16px; }.ticket { gap:16px; }</style>
