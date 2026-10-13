<script lang="ts">
  import { walletAccount, signingSession } from '$lib/wallet/session';
  import { createAccount, signIn, passkeyMessage, recoveryPhrase } from '$lib/wallet/mera';
  let busy = $state(false), message = $state(''), phrase = $state('');
  async function connect(create: boolean) { busy = true; message = ''; try { await (create ? createAccount() : signIn()); } catch(e) { message = passkeyMessage(e); } finally { busy = false; } }
  async function recover() { busy = true; message = ''; try { phrase = await recoveryPhrase(); } catch(e) { message = passkeyMessage(e); } finally { busy = false; } }
  $effect(() => { if (!$walletAccount) phrase = ''; });
</script>
<div class="account">
  {#if $walletAccount}
    <p class="address">{$walletAccount.address}</p>
    <div class="actions"><button class="secondary" onclick={() => { phrase = ''; signingSession.end(); }}>Sign out</button><button class="secondary" disabled={busy} onclick={recover}>Show recovery phrase</button></div>
    {#if phrase}<div class="recovery"><p>Keep this private. Anyone with these words can control this account.</p><p class="phrase">{phrase}</p><button onclick={() => phrase = ''}>Hide recovery phrase</button></div>{/if}
  {:else}
    <p>Create a passkey account to trade without MON.</p>
    <div class="actions"><button class="primary" disabled={busy} onclick={() => connect(true)}>Create passkey</button><button class="secondary" disabled={busy} onclick={() => connect(false)}>Sign in with passkey</button></div>
  {/if}
  {#if message}<p role="alert">{message}</p>{/if}
</div>
<style>.account { display: grid; gap: 12px; }.address { overflow-wrap: anywhere; font-size: 14px; }.actions { display: flex; flex-wrap: wrap; gap: 8px; }.recovery { display: grid; gap: 12px; }.phrase { color: var(--ink); }</style>
