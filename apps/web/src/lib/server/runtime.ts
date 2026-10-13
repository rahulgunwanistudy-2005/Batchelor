import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { createPublicClient, createWalletClient, http, isAddress, keccak256, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monad, monadTestnet } from 'viem/chains';
import { batchAuctionAbi, faucetAbi } from '@batchelor/core';
import { ApiError, RateLimiter, type RelayDependencies } from './service';
import { requireRelayReserve } from './reserve';
export const limiter = new RateLimiter();
let queue: Promise<unknown> = Promise.resolve();
let uncertain: Hex | undefined;
function config() {
  if (!['testnet', 'mainnet'].includes(env.CHAIN ?? '') || publicEnv.PUBLIC_CHAIN !== env.CHAIN || !env.RPC_HTTP || !isAddress(env.MARKET_ADDRESS ?? '') || env.MARKET_ADDRESS?.toLowerCase() !== publicEnv.PUBLIC_MARKET_ADDRESS?.toLowerCase() || !/^0x[0-9a-fA-F]{64}$/.test(env.RELAYER_PK ?? '')) throw new ApiError('NOT_CONFIGURED', 'Gasless trading is not connected yet.', 503);
  if (env.CHAIN === 'mainnet' && env.MAINNET_SENDS_ENABLED !== 'true') throw new ApiError('NOT_ENABLED', 'Gasless trading is awaiting activation.', 503);
  const chain = env.CHAIN === 'mainnet' ? monad : monadTestnet;
  const account = privateKeyToAccount(env.RELAYER_PK as Hex);
  const client = createPublicClient({ chain, transport: http(env.RPC_HTTP, { retryCount: 1, timeout: 10_000 }) });
  const wallet = createWalletClient({ account, chain, transport: http(env.RPC_HTTP, { retryCount: 0, timeout: 10_000 }) });
  return { chain, account, client, wallet, market: env.MARKET_ADDRESS as Address };
}
export async function botControl(action: 'health' | 'wake' | 'unleash') {
  if (!env.BOTS_URL || (action !== 'health' && !env.BOTS_TOKEN)) throw new ApiError('BOTS_UNAVAILABLE', 'The liquidity service is not connected yet.', 503);
  const response = await fetch(new URL(`/${action}`, env.BOTS_URL), { method: action === 'health' ? 'GET' : 'POST', headers: action === 'health' ? {} : { Authorization: `Bearer ${env.BOTS_TOKEN}` }, signal: AbortSignal.timeout(5000) });
  if (!response.ok && !(action === 'health' && response.status === 503)) throw new ApiError('BOT_CONTROL_FAILED', action === 'unleash' ? 'Pete could not start. The daily cap may be reached or the bots need funding.' : 'Liquidity service is temporarily unavailable.', response.status === 429 ? 429 : 503);
  const data = await response.json() as Record<string, unknown>;
  // Return only public status; never proxy balances or internal error diagnostics.
  return { status: data.status, awake: data.awake, unleashed: data.unleashed, remainingToday: data.remainingToday, lastHead: data.lastHead };
}
export function dependencies(): RelayDependencies {
  const c = config();
  return { chainId: c.chain.id, market: c.market, now: () => Math.floor(Date.now() / 1000),
    nonce: trader => c.client.readContract({ address: c.market, abi: batchAuctionAbi, functionName: 'nonces', args: [trader] }),
    wake: () => botControl('wake'),
    send: (action, args, gas) => {
      const work = async (): Promise<Hex> => {
        if (await c.client.getChainId() !== c.chain.id) throw new ApiError('WRONG_CHAIN', 'Trading service is connected to the wrong network.', 503);
        if (uncertain) {
          const receipt = await c.client.getTransactionReceipt({ hash: uncertain }).catch(() => null);
          if (!receipt) throw new ApiError('SEND_PENDING', 'A previous network submission is still being confirmed. Try again shortly.', 503);
          uncertain = undefined;
        }
        const balance = await c.client.getBalance({ address: c.account.address });
        const fee = await c.client.estimateFeesPerGas();
        requireRelayReserve(balance, gas, fee.maxFeePerGas);
        const nonce = await c.client.getTransactionCount({ address: c.account.address, blockTag: 'pending' });
        // Dedicated relayer key; avoid racing an unresolved send from another instance.
        if (nonce !== await c.client.getTransactionCount({ address: c.account.address, blockTag: 'latest' })) throw new ApiError('RELAYER_BUSY', 'Another order is being confirmed. Try again shortly.', 503);
        let data: Hex;
        try {
          if (action === 'drip') {
            if (!isAddress(env.FAUCET_ADDRESS ?? '')) throw new ApiError('NOT_CONFIGURED', 'Demo-token faucet is not connected yet.', 503);
            const faucet = env.FAUCET_ADDRESS as Address;
            if ((await c.client.readContract({ address: faucet, abi: faucetAbi, functionName: 'MARKET' })).toLowerCase() !== c.market.toLowerCase()) throw new ApiError('FAUCET_MISMATCH', 'Demo-token faucet configuration needs attention.', 503);
            const { request } = await c.client.simulateContract({ address: faucet, abi: faucetAbi, functionName: 'drip', args: [args[0] as Address], account: c.account, gas });
            const { encodeFunctionData } = await import('viem'); data = encodeFunctionData(request);
          } else {
            const { request } = await c.client.simulateContract({ address: c.market, abi: batchAuctionAbi, functionName: action, args: args as [never, Hex], account: c.account, gas });
            const { encodeFunctionData } = await import('viem'); data = encodeFunctionData(request);
          }
        } catch (error) {
          if (error instanceof ApiError) throw error;
          throw new ApiError('SIMULATION_FAILED', action === 'drip' ? 'Demo tokens could not be requested. Each account can claim once every 24 hours.' : 'The order could not execute. Check your balance; cancellation is only possible before the next block.');
        }
        const raw = await c.wallet.signTransaction({ to: action === 'drip' ? env.FAUCET_ADDRESS as Address : c.market, data, gas, nonce, ...fee });
        const hash = keccak256(raw);
        try { return await c.client.sendRawTransaction({ serializedTransaction: raw }); }
        catch { uncertain = hash; throw new ApiError('SUBMISSION_UNCERTAIN', `Network confirmation is delayed. Check transaction ${hash} before retrying.`, 503); }
      };
      const result = queue.then(work, work); queue = result.catch(() => undefined); return result;
    }
  };
}
export function quota(ip: string, address?: string, action = 'relay') {
  const configured = Number(env.RELAY_PER_ADDR_PER_MIN ?? 6), limit = Number.isInteger(configured) && configured > 0 ? configured : 6;
  limiter.take(`${action}:ip:${ip}`, action === 'health' ? 120 : 20);
  if (address) limiter.take(`${action}:address:${address.toLowerCase()}`, limit);
}
