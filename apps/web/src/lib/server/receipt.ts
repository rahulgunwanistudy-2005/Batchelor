import { env } from '$env/dynamic/public';
import { publicIndexer } from '$lib/api/config';
import type { ActorConfig } from '$lib/receipt';
const validAddress = /^0x[0-9a-fA-F]{40}$/;
export function publicActors(): ActorConfig {
  const pete=(env.PUBLIC_PETE_ADDRESSES ?? '').split(',').map(a=>a.trim().toLowerCase()).filter(a=>validAddress.test(a));
  const mo=env.PUBLIC_MO_ADDRESS?.toLowerCase() ?? null;
  return { pete, mo: mo && validAddress.test(mo) ? mo : null };
}
export async function loadReceipt(id: string, fetcher: typeof fetch) {
  if (!/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > 2n**64n-1n) return { receipt: null, message: 'This batch number is invalid.' };
  try {
    const indexer=publicIndexer(fetcher);
    if(!indexer) return {receipt:null,message:'Indexed receipts are not connected yet.'};
    const receipt=await indexer.batch(id);
    return {receipt,message:receipt ? null : 'This batch has not been indexed yet. Try again shortly.'};
  } catch { return {receipt:null,message:'This receipt is unavailable or still syncing. Try again shortly.'}; }
}
