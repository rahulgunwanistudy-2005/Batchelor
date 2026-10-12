<script lang="ts">import { en } from '$lib/copy/en';</script>
<svelte:head><title>{en.receipt.title} · {en.brand}</title></svelte:head>
<section class="intro"><h1>{en.receipt.title}</h1><p>{en.receipt.description}</p></section>
<section class="card empty-page"><h2>{en.receipt.empty}</h2><p>{en.receipt.detail}</p></section>
