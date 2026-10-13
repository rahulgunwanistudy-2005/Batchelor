import { batchAuctionAbi, buildIntent, intentData, intentJSON } from '@batchelor/core';
import { decodeEventLog, type Hex } from 'viem';
import { chainConfig, publicClient } from '$lib/chain/client';
import { signingSession } from '$lib/wallet/session';
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) }); }
  catch { throw new Error('The service could not be reached. Refresh and try again shortly.'); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The service could not respond. Try again shortly.'); }
  if (!response.ok) throw new Error(result.error?.message ?? 'Request failed. Try again.');
  return result as T;
}
export async function signedOrder(action: 0 | 1, side = 0, tick = 100, lots = 0n, orderId = 0n) {
  const config = chainConfig(); if (!config) throw new Error('Trading is not connected yet.');
  const account = signingSession.get(), client = publicClient();
  const nonce = await client.readContract({ address: config.market, abi: batchAuctionAbi, functionName: 'nonces', args: [account.address] });
  const intent = buildIntent({ trader: account.address, action, side, tick, lots, orderId, nonce });
  const sig = await account.signTypedData(intentData(config.chain.id, config.market, intent));
  return api<{ hash: Hex }>('/api/relay', { intent: intentJSON(intent), sig });
}
export async function confirmed(hash: Hex) {
  const receipt = await publicClient().waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== 'success') throw new Error('The transaction reverted. Refresh your balance and try again.');
  return receipt;
}
export async function placedOrder(hash: Hex) {
  const receipt = await confirmed(hash), config = chainConfig()!;
  for (const log of receipt.logs) if (log.address.toLowerCase() === config.market.toLowerCase()) {
    try { const decoded = decodeEventLog({ abi: batchAuctionAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === 'OrderPlaced') return { ...decoded.args, hash };
    } catch { /* Other market events share the same receipt. */ }
  }
  throw new Error('No order was found in this transaction. Check its receipt.');
}
