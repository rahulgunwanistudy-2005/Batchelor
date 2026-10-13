import { env } from '$env/dynamic/public';
import { dev } from '$app/environment';
import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, createSecp256k1SigningSession, isMeraError, type PasskeyCredentialMetadata } from '@category-labs/mera';
import { toViemAccount } from '@category-labs/mera/viem';
import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { signingSession } from './session';
import { en } from '$lib/copy/en';
export function relyingParty() {
  const id = env.PUBLIC_RP_ID || (dev && location.hostname === 'localhost' ? 'localhost' : '');
  if (!id || !/^[a-z0-9.-]+$/.test(id) || (location.hostname !== id && !location.hostname.endsWith(`.${id}`))) throw new Error('Passkey sign-in is not configured for this domain. Open the permanent Batchelor address.');
  if (!window.isSecureContext) throw new Error(en.wallet.CRYPTO_UNAVAILABLE);
  return id;
}
const storageKey = (id: string) => `batchelor.passkey.v1:${id}`;
export function savedCredential(): PasskeyCredentialMetadata | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(relyingParty())) ?? 'null');
    if (value && typeof value.credentialId === 'string' && /^[A-Za-z0-9_-]+$/.test(value.credentialId) && (value.transports === undefined || (Array.isArray(value.transports) && value.transports.every((t: unknown) => typeof t === 'string')))) return value;
  } catch { /* A corrupt or unavailable local store must still allow passkey discovery. */ }
}
export function passkeyMessage(error: unknown) {
  if (isMeraError(error)) return en.wallet[error.code as keyof typeof en.wallet] ?? 'Passkey operation failed. Try signing in again.';
  return error instanceof Error ? error.message : 'Passkey operation failed. Try again.';
}
function unlock(prf: Uint8Array) {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prf, wordlist));
  const root = HDKey.fromMasterSeed(seed), child = root.derive("m/44'/60'/0'/0/0");
  try {
    if (!child.privateKey) throw new Error('The passkey could not derive an account. Try again.');
    const session = createSecp256k1SigningSession({ privateKey: child.privateKey });
    const account = toViemAccount(session); signingSession.start(session, account); return account;
  } finally { seed.fill(0); prf.fill(0); child.wipePrivateData(); root.wipePrivateData(); }
}
export async function createAccount() {
  const id = relyingParty();
  const created = await createPasskeyWithPrfOutput({ rp: { id, name: 'Batchelor' }, user: { name: 'Batchelor trader', displayName: 'Batchelor trader' } });
  try { localStorage.setItem(storageKey(id), JSON.stringify({ credentialId: created.credentialId, transports: created.transports })); } catch { /* Discovery still works when storage is blocked. */ }
  return unlock(created.prfOutput);
}
export async function signIn() {
  const id = relyingParty();
  const result = await getPasskeyPrfOutput({ rpId: id, ...(savedCredential() ? { credential: savedCredential()! } : {}) });
  try { localStorage.setItem(storageKey(id), JSON.stringify({ credentialId: result.credentialId })); } catch { /* Optional metadata. */ }
  return unlock(result.prfOutput);
}
export async function recoveryPhrase() {
  const result = await getPasskeyPrfOutput({ rpId: relyingParty(), ...(savedCredential() ? { credential: savedCredential()! } : {}) });
  try {
    // Confirm a fresh prompt selected the current account, rather than a different credential.
    const expected = signingSession.get().address;
    if (unlock(result.prfOutput.slice()).address !== expected) { signingSession.end(); throw new Error('This passkey belongs to a different account. Sign in again.'); }
    return entropyToMnemonic(result.prfOutput, wordlist);
  } finally { result.prfOutput.fill(0); }
}
