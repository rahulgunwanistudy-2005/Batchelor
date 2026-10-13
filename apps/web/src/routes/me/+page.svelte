<script lang="ts">
  import type { PageData } from './$types';
  import { onMount, untrack } from 'svelte';
  import { createWalletClient, http, formatUnits, parseUnits, type Hex } from 'viem';
  import { batchAuctionAbi, transactionGas, DEMO_LOT } from '@batchelor/core';
  import Account from '$lib/ui/Account.svelte';
  import { walletAccount, signingSession } from '$lib/wallet/session';
  import { live, startLive } from '$lib/chain/live';
  import { chainConfig, publicClient } from '$lib/chain/client';
  import { signedOrder, confirmed } from '$lib/api/trading';
  import { publicIndexer } from '$lib/api/config';
  import type { IndexedOrder } from '$lib/api/graphql';
  let { data }: { data: PageData } = $props();
  let balances=$state<readonly [bigint,bigint]|null>(null), mon=$state<bigint|null>(null), orders=$state<IndexedOrder[]>([]), historyMessage=$state('');
  let message=$state(''), busy=$state(false), token=$state('base'), amount=$state('1'), hash=$state<Hex|null>(null);
  let cancellable=$state<Set<bigint>>(new Set());
  let refreshing = false;
  async function refresh(includeHistory=false) {
    if (refreshing) return;
    const c=chainConfig(), account=$walletAccount; if(!c || !account) return;
    refreshing = true;
    try {
      const [value,native]=await Promise.all([publicClient().readContract({address:c.market,abi:batchAuctionAbi,functionName:'balances',args:[account.address]}),publicClient().getBalance({address:account.address})]);
      if($walletAccount?.address!==account.address) return;
      balances=value; mon=native;
      if(includeHistory) {
        const indexer=publicIndexer();
        if(indexer) { const history=await indexer.ordersByTrader(account.address,20); if($walletAccount?.address!==account.address) return; orders=history; historyMessage=''; }
        else historyMessage='Indexed order history is not connected yet.';
      }
      const head=await publicClient().getBlockNumber({cacheTime:0});
      const meta=await publicClient().readContract({address:c.market,abi:batchAuctionAbi,functionName:'openBatch'});
      if ($walletAccount?.address !== account.address) return;
      cancellable=new Set(meta.hasOpen && head<meta.startBlock+$live.batchBlocks ? orders.filter(o=>!o.claimed && !o.cancelled && o.batch.batchId===meta.id).map(o=>o.orderId) : []);
    } catch { historyMessage='Balances or indexed history are temporarily unavailable. Try again shortly.'; }
    finally { refreshing = false; }
  }
  $effect(()=>{const address=$walletAccount?.address;balances=null;mon=null;orders=[];cancellable=new Set();hash=null;message='';if(address) untrack(()=>void refresh(true));});
  onMount(()=>{const stop=startLive();let n=0;const timer=setInterval(()=>void refresh(++n%5===0),2000);return()=>{stop();clearInterval(timer);};});
  async function cancel(id:bigint) { busy=true;message='Signing cancellation…';try { const result=await signedOrder(1,0,0,0n,id);hash=result.hash;await confirmed(result.hash);message='Order cancelled. Escrow returned to your balance.';await refresh(true); } catch(e){message=e instanceof Error?e.message:'Cancellation failed.';} finally{busy=false;} }
  async function withdraw() {
    busy=true;message='Preparing withdrawal…';
    try {
      const c=chainConfig();if(!c || !$live.base || !$live.quote)throw new Error('Market is not connected yet.');
      const account=signingSession.get(), decimals=token==='base'?18:6, units=parseUnits(amount,decimals);
      if(!/^\d+(\.\d+)?$/.test(amount) || units<=0n || !balances || units>balances[token==='base'?0:1])throw new Error('Enter an amount within your available balance.');
      const client=publicClient(), gas=transactionGas('withdraw'), fees=await client.estimateFeesPerGas();
      if(await client.getChainId()!==c.chain.id)throw new Error('The RPC is connected to the wrong network.');
      if(await client.getBalance({address:account.address})<gas*fees.maxFeePerGas)throw new Error('Withdrawal needs MON to cover the network fee. Add MON to this passkey account, then try again.');
      await client.simulateContract({address:c.market,abi:batchAuctionAbi,functionName:'withdraw',args:[token==='base'?$live.base:$live.quote,units],account,gas});
      const wallet=createWalletClient({account,chain:c.chain,transport:http(c.rpc)});
      hash=await wallet.writeContract({address:c.market,abi:batchAuctionAbi,functionName:'withdraw',args:[token==='base'?$live.base:$live.quote,units],chain:c.chain,gas,...fees});await confirmed(hash);message='Withdrawal complete. Tokens are now in your passkey account.';await refresh();
    }catch(e){message=e instanceof Error?e.message:'Withdrawal failed.';}finally{busy=false;}
  }
</script>
<svelte:head><title>My orders · Batchelor</title></svelte:head>
<section class="intro"><h1>My orders</h1><p>Your trading balances, recent orders, and fills.</p></section>
<div class="account-grid"><section class="card"><h2>Your account</h2><Account />
  {#if $walletAccount}<div class="balances"><p>{balances?formatUnits(balances[0],18):'—'} ROSE</p><p>{balances?formatUnits(balances[1],6):'—'} dUSD</p><p class="small">{mon!==null?formatUnits(mon,18):'—'} MON in your passkey account</p></div>
  <form onsubmit={e=>{e.preventDefault();void withdraw();}}><h2>Withdraw demo tokens</h2><label for="token">Token</label><select id="token" bind:value={token}><option value="base">ROSE</option><option value="quote">dUSD</option></select><label for="withdraw">Amount</label><input id="withdraw" inputmode="decimal" bind:value={amount} /><button class="primary" disabled={busy || !balances}>Withdraw</button></form>
  <p class="small">Withdrawals send tokens to your passkey account and need MON for the network fee.</p><a class="text-link small" href={chainConfig()?.chain.id===10143?'https://www.alchemy.com/faucets/monad-testnet':'https://app.monad.xyz/'} target="_blank" rel="noreferrer">How to get MON</a>
  {/if}
  {#if message}<p role="status">{message}</p>{/if}{#if hash}<a class="text-link" href={`${chainConfig()?.chain.blockExplorers?.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction</a>{/if}
</section><section class="card"><h2>Recent orders</h2>
  {#if $walletAccount}
    {#if historyMessage}<p role="status">{historyMessage}</p>{/if}
    {#if !orders.length}<p>No indexed orders for this account yet.</p>{/if}
    <ul>{#each orders as o (o.id)}<li><a class="text-link" href={`/b/${o.batch.batchId}?trader=${$walletAccount.address}`}>Order #{o.orderId} · {o.side===0?'Buy':'Sell'}</a><p>{formatUnits(o.lots*($live.lot || DEMO_LOT),18)} ROSE · {o.cancelled?'Cancelled':o.claimed?'Claimed':o.batch.clearedBlock!==null?'Cleared · awaiting claim':cancellable.has(o.orderId)?'Open':'Sealed · awaiting clearing'}</p><p>Filled: {formatUnits(o.side===0?o.baseOut:o.baseIn,18)} ROSE</p>{#if cancellable.has(o.orderId)}<button class="secondary" disabled={busy} onclick={()=>cancel(o.orderId)}>Cancel order</button>{/if}</li>{/each}</ul>
  {:else}<p>Sign in to see your account, or look up a public address.</p>{/if}
  <details><summary>Look up another trader</summary><form method="GET"><label for="trader">Trader address</label><input id="trader" name="trader" value={data.trader} placeholder="0x…" required /><button class="secondary">View orders</button></form>
  {#if data.message}<p role="status">{data.message}</p>{:else}<ul>{#each data.orders as o (o.id)}<li><a class="text-link" href={`/b/${o.batch.batchId}?trader=${data.trader}`}>Order #{o.orderId} · {o.side===0?'Buy':'Sell'} · {formatUnits(o.lots*($live.lot || DEMO_LOT),18)} ROSE</a><p>Filled {formatUnits(o.side===0?o.baseOut:o.baseIn,18)} ROSE</p></li>{/each}</ul>{/if}</details>
</section></div>
<style>.account-grid { display:grid;grid-template-columns:1fr 1fr;gap:24px; }.balances { margin:24px 0; }.balances p { color:var(--ink);font-size:20px; }form { display:grid;gap:12px;margin:24px 0; }ul { list-style:none;padding:0; }li { padding:16px 0;border-top:1px solid var(--line); }summary { cursor:pointer;margin:20px 0; }@media(max-width:800px){.account-grid{grid-template-columns:1fr;}}</style>
