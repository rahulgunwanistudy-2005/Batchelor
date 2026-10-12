<script lang="ts">import { en } from '$lib/copy/en';</script>
<svelte:head><title>{en.nav.proof} · {en.brand}</title></svelte:head>
<section class="intro"><h1>{en.proof.title}</h1><p>{en.proof.description}</p></section>
<div class="proof-grid">
  <section class="card"><h2>{en.proof.storage}</h2><p>{en.proof.storageDetail}</p></section>
  <section class="card"><h2>{en.proof.settlement}</h2><p>{en.proof.settlementDetail}</p></section>
  <section class="card"><h2>{en.proof.clearing}</h2><p>{en.proof.clearingDetail}</p></section>
  <section class="card"><h2>{en.proof.deployed}</h2><p>{en.proof.deployedDetail}</p></section>
</div>
