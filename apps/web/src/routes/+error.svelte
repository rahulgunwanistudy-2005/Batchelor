<script lang="ts">
  import { page } from '$app/state';
</script>
<svelte:head><title>Page unavailable · Batchelor</title></svelte:head>
<section class="card" aria-labelledby="error-title">
  <h1 id="error-title">{page.status === 404 ? 'Page not found' : 'Page unavailable'}</h1>
  <p>{page.status === 404 ? 'This link does not lead to a page. Check the link or return to Trade.' : page.error?.message ?? 'Refresh this page and try again.'}</p>
  <a class="text-link" href="/">Return to Trade</a>
</section>
