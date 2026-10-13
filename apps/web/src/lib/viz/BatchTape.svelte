<script lang="ts">
  import type { Clear } from '$lib/chain/live';
  let { batches }: { batches: Clear[] } = $props();
  const maximum = $derived(batches.reduce((v,b) => b.volumeLots > v ? b.volumeLots : v, 1n));
  const min = $derived(batches.reduce((v,b) => b.clearTick < v ? b.clearTick : v,255));
  const max = $derived(batches.reduce((v,b) => b.clearTick > v ? b.clearTick : v,0));
</script>
<div class="tape" role="group" aria-label="Last 60 batches, height shows volume and dots show clearing price">
  {#each batches.slice(0,60).reverse() as b (b.batchId)}<a href={`/b/${b.batchId}`} aria-label={`Batch ${b.batchId}, ${b.volumeLots} lots, clearing tick ${b.clearTick}`} style={`--volume:${Math.max(3,Number(b.volumeLots * 100n / maximum))}%;--price:${10 + (b.clearTick-min)/Math.max(1,max-min)*75}%`}><span class="bar"></span>{#if b.volumeLots}<span class="dot"></span>{/if}</a>{/each}
</div>
{#if !batches.length}<p>No cleared batches available yet.</p>{/if}
<style>.tape { display:flex; gap:4px; height:70px; align-items:flex-end; margin:24px 0 12px; }.tape a { position:relative; flex:1; max-width:30px; min-width:3px; height:100%; }.bar { position:absolute; bottom:0; width:100%; height:var(--volume); background:var(--muted); opacity:.35; border-radius:2px; }.dot { position:absolute; bottom:var(--price); left:50%; width:5px; height:5px; margin-left:-2px; border-radius:50%; background:var(--clear); }</style>
