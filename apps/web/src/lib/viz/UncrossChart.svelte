<script lang="ts">
  import { untrack } from 'svelte';
  import type { LiveState } from '$lib/chain/live';
  import { formatUnits } from 'viem';
  let { state: snapshot }: { state: LiveState } = $props();
  let flash = $state(false), clearingTick = $state<number | null>(null);
  let seen: bigint | undefined;
  const clearId = $derived(snapshot.lastClear?.batchId);
  $effect(() => { const id = clearId; const clear = untrack(() => snapshot.lastClear); if (clear && id !== seen) { seen = clear.batchId; untrack(() => { flash = true; clearingTick = clear.volumeLots ? clear.clearTick : null; }); const timer = setTimeout(() => { flash = false; clearingTick = null; }, 300); return () => clearTimeout(timer); } });
  const active = $derived(snapshot.bids.map((b,i) => b > 0n || (snapshot.asks[i] ?? 0n) > 0n ? i : -1).filter(i => i >= 0));
  const lo = $derived(Math.max(0, (active[0] ?? 90) - 10)), hi = $derived(Math.min(255, (active.at(-1) ?? 110) + 10));
  const curves = $derived.by(() => {
    const demand = Array<bigint>(snapshot.bids.length).fill(0n), supply = Array<bigint>(snapshot.asks.length).fill(0n);
    let d = 0n, s = 0n;
    for (let i = snapshot.bids.length - 1; i >= 0; i--) { d += snapshot.bids[i]!; demand[i] = d; }
    for (let i = 0; i < snapshot.asks.length; i++) { s += snapshot.asks[i]!; supply[i] = s; }
    return { demand, supply };
  });
  const demand = $derived(curves.demand), supply = $derived(curves.supply);
  const maximum = $derived([...demand, ...supply].reduce((a,b) => a > b ? a : b, 1n));
  const tick = $derived(flash && clearingTick !== null ? clearingTick : snapshot.indicative && snapshot.indicative.volumeLots > 0n ? snapshot.indicative.clearTick : snapshot.lastClear?.volumeLots ? snapshot.lastClear.clearTick : null);
  const price = $derived(tick === null ? null : snapshot.minPrice + BigInt(tick) * snapshot.tickSize);
  const x = (i: number) => 35 + (i - lo) / Math.max(1, hi-lo) * 530;
  const y = (v: bigint) => 225 - Number(v * 18000n / maximum) / 100;
  function steps(values: readonly bigint[]) { let path = `M${x(lo)},${y(values[lo] ?? 0n)}`; for (let i=lo+1;i<=hi;i++) path += `H${x(i)}V${y(values[i] ?? 0n)}`; return path; }
</script>
<div class="price" aria-live="off">{price !== null ? formatUnits(price, 6) : '—'} <span>dUSD</span></div>
<p>{snapshot.indicative?.volumeLots ? 'Indicative clearing price' : snapshot.lastClear?.volumeLots ? 'Last clearing price' : 'Waiting for crossing orders'}</p>
<svg class:flash viewBox="0 0 600 270" role="img" aria-label="Cumulative buy and sell orders by limit price">
  <path class="grid" d="M35 45H565M35 105H565M35 165H565M35 225H565" />
  <path class="demand" d={steps(demand)} /><path class="supply" d={steps(supply)} />
  {#if tick !== null && tick >= lo && tick <= hi}<line class="clear" style={`transform:translateX(${x(tick)}px)`} x1="0" x2="0" y1="25" y2="225" />{/if}
  <text x="35" y="254">{formatUnits(snapshot.minPrice + BigInt(lo) * snapshot.tickSize, 6)} dUSD</text>
  <text x="565" y="254" text-anchor="end">{formatUnits(snapshot.minPrice + BigInt(hi) * snapshot.tickSize, 6)} dUSD</text>
</svg>
<details><summary>View order book as a table</summary>
  <table><caption>Top ten occupied ticks on each side</caption><thead><tr><th scope="col">Side</th><th scope="col">Limit price</th><th scope="col">Amount</th></tr></thead><tbody>
    {#each snapshot.bids.map((lots,tick) => ({lots,tick})).filter(v => v.lots > 0n).reverse().slice(0,10) as row}<tr><td>Buy</td><td>{formatUnits(snapshot.minPrice + BigInt(row.tick) * snapshot.tickSize,6)} dUSD</td><td>{formatUnits(row.lots * snapshot.lot,18)} ROSE</td></tr>{/each}
    {#each snapshot.asks.map((lots,tick) => ({lots,tick})).filter(v => v.lots > 0n).slice(0,10) as row}<tr><td>Sell</td><td>{formatUnits(snapshot.minPrice + BigInt(row.tick) * snapshot.tickSize,6)} dUSD</td><td>{formatUnits(row.lots * snapshot.lot,18)} ROSE</td></tr>{/each}
  </tbody></table>
</details>
<style>
.price { font-family: 'Bricolage Grotesque',sans-serif; font-size: clamp(44px,7vw,88px); font-weight: 700; letter-spacing:-3px; color:var(--clear); margin-top:20px; line-height:1.15; }.price span { font: 16px 'IBM Plex Sans',sans-serif; letter-spacing:0; }
svg { width:100%; height:auto; margin:16px 0; }path { fill:none; stroke-width:3; }.grid { stroke:var(--muted); opacity:.2; stroke-width:1; }.demand { stroke:var(--bid); }.supply { stroke:var(--ask); }.clear { stroke:var(--clear); stroke-width:2; transition:transform .25s; }text { fill:var(--muted); font-size:13px; }.demand,.supply { transition:opacity .3s; }.flash .demand,.flash .supply { opacity:.3; }summary { cursor:pointer; margin:12px 0; }table { font-size:14px; width:100%; text-align:left; }td,th { padding:6px 3px; }
@media(prefers-reduced-motion:reduce){.flash .demand,.flash .supply{opacity:1;}}
</style>
