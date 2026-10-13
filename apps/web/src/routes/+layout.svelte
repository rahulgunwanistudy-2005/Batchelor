<script lang="ts">
  import '../app.css';
  import '@fontsource/bricolage-grotesque/600.css';
  import '@fontsource/bricolage-grotesque/700.css';
  import '@fontsource/ibm-plex-sans/400.css';
  import '@fontsource/ibm-plex-sans/500.css';
  import { page } from '$app/state';
  import { env } from '$env/dynamic/public';
  import { en } from '$lib/copy/en';
  let { children } = $props();
</script>

<a class="skip" href="#main">{en.skip}</a>
<div class="shell">
  <header>
    <a class="wordmark" href="/">{en.brand}<span aria-hidden="true">.</span></a>
    <nav aria-label={en.brand}>
      <a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>{en.nav.trade}</a>
      <a href="/me" aria-current={page.url.pathname === '/me' ? 'page' : undefined}>{en.nav.orders}</a>
      <a href="/proof" aria-current={page.url.pathname === '/proof' ? 'page' : undefined}>{en.nav.proof}</a>
    </nav>
  </header>
  <main id="main" tabindex="-1">
    <div class="stage"><span class="status-dot" aria-hidden="true"></span>{en.stage}</div>
    {@render children()}
  </main>
  <footer><p>{en.tagline}</p><p>Demo tokens on Monad{env.PUBLIC_CHAIN === 'testnet' ? ' testnet' : env.PUBLIC_CHAIN === 'mainnet' ? ' mainnet' : ''}. No real value.</p></footer>
</div>
